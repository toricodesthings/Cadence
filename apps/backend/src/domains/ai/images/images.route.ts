import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { CHAT_IMAGE_LIMITS, chatImageReportSchema, type ChatImageUpload } from "@cadence/contracts/ai";
import { aiImages } from "../../../db/schema";
import type { AuthVariables } from "../../../platform/auth";
import { getDbClient } from "../../../platform/db";
import { AppError, throwIfNotFound } from "../../../platform/errors";
import { hashIdentifier, logger } from "../../../platform/log";
import { getRateLimitRedis } from "../../../platform/redis";
import { getRequestId } from "../../../platform/request-log";
import { withRls } from "../../../platform/rls";
import { apiValidator } from "../../../platform/validation";
import { sanitizeStillWebp } from "../../../platform/webp";
import type { Env } from "../../../types/env";
import { readImageUsage, resolveLimits } from "../safety/rate-limit";
import { AI_IMAGE_CACHE_CONTROL, aiImageKey, contentHash, countPending, REPORT_KEEP_DAYS } from "./chat-images";

/**
 * Photos for the assistant: upload (with per-conversation dedup), report,
 * read back, and remove before sending. Bytes live in the private
 * `USER_ASSETS` bucket and are only served back to their owner here.
 */

/** Multipart overhead on top of the file itself. */
const UPLOAD_BODY_SLACK = 64 * 1024;

const uploadFormSchema = z.object({ file: z.instanceof(File), conversationId: z.uuid() });
const imageParamSchema = z.object({ id: z.uuid() });

function requireBucket(env: Env): R2Bucket {
    if (!env.USER_ASSETS) {
        throw new AppError(503, "STORAGE_UNAVAILABLE", "Image storage is not available right now", true);
    }
    return env.USER_ASSETS;
}

function tooLarge(): AppError {
    return new AppError(413, "IMAGE_TOO_LARGE", "That image is too large");
}

export const aiImageRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    // ── Create: upload (or reuse) one image ──────────────────────────────
    .post(
        "/",
        bodyLimit({
            maxSize: CHAT_IMAGE_LIMITS.maxBytes + UPLOAD_BODY_SLACK,
            onError: () => {
                throw tooLarge();
            },
        }),
        apiValidator("form", uploadFormSchema),
        async (c) => {
            const userId = c.get("userId");
            const userKey = await hashIdentifier(userId);
            const { file, conversationId } = c.req.valid("form");
            const limits = resolveLimits(c.env);

            let sanitized: ReturnType<typeof sanitizeStillWebp>;
            try {
                if (file.size > CHAT_IMAGE_LIMITS.maxBytes) throw tooLarge();
                sanitized = sanitizeStillWebp(new Uint8Array(await file.arrayBuffer()), {
                    maxDimension: CHAT_IMAGE_LIMITS.serverMaxDimension,
                    label: "Image",
                });
            } catch (error) {
                // Enough to diagnose the class of failure; nothing that leads to the image.
                logger.warn("ai", "ai_image_rejected", {
                    requestId: getRequestId(c),
                    userHash: userKey,
                    code: error instanceof AppError ? error.code : "UNKNOWN",
                    bytes: file.size,
                });
                throw error;
            }
            const { bytes, width, height } = sanitized;
            const hash = await contentHash(bytes);
            const bucket = requireBucket(c.env);

            const { id, reused } = await withRls(getDbClient(c.env), userId, async (tx) => {
                // Same bytes in the same conversation → the image we already have.
                const [existing] = await tx
                    .update(aiImages)
                    .set({ lastUsedAt: sql`now()` })
                    .where(
                        and(
                            eq(aiImages.userId, userId),
                            eq(aiImages.conversationId, conversationId),
                            eq(aiImages.contentHash, hash),
                        ),
                    )
                    .returning({ id: aiImages.id });
                if (existing) return { id: existing.id, reused: true };

                if ((await countPending(tx, userId)) >= limits.imagesMaxPending) {
                    throw new AppError(
                        429,
                        "AI_IMAGE_PENDING_LIMIT",
                        "Send or remove the images you've attached before adding more",
                    );
                }

                const id = crypto.randomUUID();
                const key = aiImageKey(userKey, id);
                // No custom metadata and no filename: only the database links a user to an image.
                await bucket.put(key, bytes, {
                    httpMetadata: { contentType: "image/webp", cacheControl: AI_IMAGE_CACHE_CONTROL },
                });
                try {
                    await tx.insert(aiImages).values({
                        id,
                        userId,
                        conversationId,
                        contentHash: hash,
                        bytes: bytes.length,
                        width,
                        height,
                    });
                } catch (error) {
                    await bucket.delete(key).catch(() => undefined);
                    throw error;
                }
                return { id, reused: false };
            });

            const redis = getRateLimitRedis(c.env);
            const usage = redis ? await readImageUsage(redis, userKey, limits).catch(() => null) : null;
            const data: ChatImageUpload = {
                id,
                reused,
                images: {
                    used: usage?.used ?? 0,
                    limit: limits.images24h,
                    resetEpoch: usage?.resetEpoch ?? null,
                },
            };
            return c.json({ data }, reused ? 200 : 201);
        },
    )
    // ── Create: share one image with an error report (consent per incident) ──
    .post(
        "/:id/report",
        apiValidator("param", imageParamSchema),
        apiValidator("json", chatImageReportSchema),
        async (c) => {
            const userId = c.get("userId");
            const { id } = c.req.valid("param");
            const { requestId } = c.req.valid("json");

            const [row] = await withRls(getDbClient(c.env), userId, (tx) =>
                tx
                    .update(aiImages)
                    .set({
                        diagnosticsSharedAt: sql`now()`,
                        // Keep it long enough to look at, never shorter than it already had.
                        lastUsedAt: sql`greatest(${aiImages.lastUsedAt}, now() + ${`${REPORT_KEEP_DAYS} days`}::interval)`,
                    })
                    .where(and(eq(aiImages.id, id), eq(aiImages.userId, userId)))
                    .returning({ id: aiImages.id }),
            );
            throwIfNotFound(row, "Image");

            // The one log line that joins an incident to a specific image.
            logger.warn("ai", "ai_image_reported", {
                requestId: requestId ?? getRequestId(c),
                userHash: await hashIdentifier(userId),
                imageId: id,
            });
            return c.json({ data: { id, reported: true } });
        },
    )
    // ── Read: the owner's image bytes ────────────────────────────────────
    .get("/:id", apiValidator("param", imageParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const bucket = requireBucket(c.env);

        const [row] = await withRls(getDbClient(c.env), userId, (tx) =>
            tx
                .select({ id: aiImages.id })
                .from(aiImages)
                .where(and(eq(aiImages.id, id), eq(aiImages.userId, userId)))
                .limit(1),
        );
        throwIfNotFound(row, "Image");

        // The key is built from the caller's own userKey, so a foreign id can never resolve.
        const object = await bucket.get(aiImageKey(await hashIdentifier(userId), id), { onlyIf: c.req.raw.headers });
        throwIfNotFound(object, "Image");

        const headers = {
            "Content-Type": "image/webp",
            "Cache-Control": AI_IMAGE_CACHE_CONTROL,
            ETag: object.httpEtag,
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
        };
        if (!("body" in object)) return c.body(null, 304, headers);
        return c.body(object.body, 200, headers);
    })
    // ── Delete: take an attached image off before sending ────────────────
    .delete("/:id", apiValidator("param", imageParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const bucket = requireBucket(c.env);
        const userKey = await hashIdentifier(userId);

        await withRls(getDbClient(c.env), userId, async (tx) => {
            // Only while unsent: a sent image belongs to the thread's history.
            const [row] = await tx
                .select({ id: aiImages.id })
                .from(aiImages)
                .where(and(eq(aiImages.id, id), eq(aiImages.userId, userId), isNull(aiImages.sentAt)))
                .limit(1);
            throwIfNotFound(row, "Image");
            // Storage first: if it fails, the row stays and the orphan sweep retries.
            await bucket.delete(aiImageKey(userKey, id));
            await tx.delete(aiImages).where(and(eq(aiImages.id, id), eq(aiImages.userId, userId)));
        });

        return c.json({ data: { id, deleted: true } });
    });
