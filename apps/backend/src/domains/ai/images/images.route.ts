import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { uuidParamSchema } from "@cadence/contracts/common";
import {
    CHAT_FILE_LIMITS,
    CHAT_IMAGE_LIMITS,
    CHAT_IMAGE_MEDIA_TYPE,
    CHAT_PDF_MEDIA_TYPE,
    chatImageReportSchema,
    type ChatImageUpload,
} from "@cadence/contracts/ai";
import { aiImages } from "../../../db/schema";
import type { AuthVariables } from "../../../platform/auth";
import { getDbClient } from "../../../platform/db";
import { AppError, throwIfNotFound } from "../../../platform/errors";
import { hashIdentifier, logger } from "../../../platform/log";
import { getRateLimitRedis } from "../../../platform/redis";
import { getRequestId } from "../../../platform/request-log";
import { withRls } from "../../../platform/rls";
import { apiValidator } from "../../../platform/validation";
import { checkPdf } from "../../../platform/pdf";
import { requireBucket, sanitizeStillWebp, webpResponse } from "../../../platform/webp";
import type { Env } from "../../../types/env";
import { readImageUsage, resolveLimits } from "../safety/rate-limit";
import { AI_IMAGE_CACHE_CONTROL, aiImageKey, contentHash, countPending, REPORT_KEEP_DAYS } from "./chat-images";

const UPLOAD_BODY_SLACK = 64 * 1024;

const uploadFormSchema = z.object({ file: z.instanceof(File), conversationId: z.uuid() });

function tooLarge(kind = "file"): AppError {
    return new AppError(413, "IMAGE_TOO_LARGE", `That ${kind} is too large`);
}

export const aiImageRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post(
        "/",
        bodyLimit({
            maxSize: Math.max(CHAT_IMAGE_LIMITS.maxBytes, CHAT_FILE_LIMITS.pdfMaxBytes) + UPLOAD_BODY_SLACK,
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

            const isPdf = file.type === CHAT_PDF_MEDIA_TYPE;
            const mediaType: ChatImageUpload["mediaType"] = isPdf ? CHAT_PDF_MEDIA_TYPE : CHAT_IMAGE_MEDIA_TYPE;
            let stored: {
                bytes: Uint8Array<ArrayBuffer>;
                width: number | null;
                height: number | null;
                pages: number | null;
            };
            try {
                if (file.size > (isPdf ? CHAT_FILE_LIMITS.pdfMaxBytes : CHAT_IMAGE_LIMITS.maxBytes))
                    throw tooLarge(isPdf ? "PDF" : "photo");
                const raw = new Uint8Array(await file.arrayBuffer());
                stored = isPdf
                    ? { bytes: raw, width: null, height: null, ...checkPdf(raw) }
                    : {
                          ...sanitizeStillWebp(raw, {
                              maxDimension: CHAT_IMAGE_LIMITS.serverMaxDimension,
                              label: "Image",
                          }),
                          pages: null,
                      };
            } catch (error) {
                logger.warn("ai", "ai_image_rejected", {
                    requestId: getRequestId(c),
                    userHash: userKey,
                    code: error instanceof AppError ? error.code : "UNKNOWN",
                    bytes: file.size,
                });
                throw error;
            }
            const { bytes, width, height, pages } = stored;
            const hash = await contentHash(bytes);
            const bucket = requireBucket(c.env, "Image");

            const {
                id,
                reused,
                pages: storedPages,
                mediaType: storedType,
            } = await withRls(getDbClient(c.env), userId, async (tx) => {
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
                    .returning({ id: aiImages.id, pages: aiImages.pages, mediaType: aiImages.mediaType });
                if (existing)
                    return {
                        id: existing.id,
                        reused: true,
                        pages: existing.pages,
                        mediaType: existing.mediaType as ChatImageUpload["mediaType"],
                    };

                if ((await countPending(tx, userId)) >= limits.imagesMaxPending) {
                    throw new AppError(
                        429,
                        "AI_IMAGE_PENDING_LIMIT",
                        "Send or remove the files you've attached before adding more",
                    );
                }

                const id = crypto.randomUUID();
                const key = aiImageKey(userKey, id, mediaType);
                await bucket.put(key, bytes, {
                    httpMetadata: { contentType: mediaType, cacheControl: AI_IMAGE_CACHE_CONTROL },
                });
                try {
                    await tx.insert(aiImages).values({
                        id,
                        userId,
                        conversationId,
                        contentHash: hash,
                        bytes: bytes.length,
                        mediaType,
                        pages,
                        width,
                        height,
                    });
                } catch (error) {
                    await bucket.delete(key).catch(() => undefined);
                    throw error;
                }
                return { id, reused: false, pages, mediaType };
            });

            const redis = getRateLimitRedis(c.env);
            const usage = redis ? await readImageUsage(redis, userKey, limits).catch(() => null) : null;
            const data: ChatImageUpload = {
                id,
                reused,
                mediaType: storedType,
                pages: storedPages,
                images: {
                    used: usage?.used ?? 0,
                    limit: limits.images24h,
                    resetEpoch: usage?.resetEpoch ?? null,
                },
            };
            return c.json({ data }, reused ? 200 : 201);
        },
    )
    .post(
        "/:id/report",
        apiValidator("param", uuidParamSchema),
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
                        lastUsedAt: sql`greatest(${aiImages.lastUsedAt}, now() + ${`${REPORT_KEEP_DAYS} days`}::interval)`,
                    })
                    .where(and(eq(aiImages.id, id), eq(aiImages.userId, userId)))
                    .returning({ id: aiImages.id }),
            );
            throwIfNotFound(row, "Image");

            logger.warn("ai", "ai_image_reported", {
                requestId: requestId ?? getRequestId(c),
                userHash: await hashIdentifier(userId),
                imageId: id,
            });
            return c.json({ data: { id, reported: true } });
        },
    )
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const bucket = requireBucket(c.env, "Image");

        const [row] = await withRls(getDbClient(c.env), userId, (tx) =>
            tx
                .select({ id: aiImages.id, mediaType: aiImages.mediaType })
                .from(aiImages)
                .where(and(eq(aiImages.id, id), eq(aiImages.userId, userId)))
                .limit(1),
        );
        throwIfNotFound(row, "Image");

        const object = await bucket.get(aiImageKey(await hashIdentifier(userId), id, row.mediaType), {
            onlyIf: c.req.raw.headers,
        });
        throwIfNotFound(object, "Image");

        return webpResponse(object, AI_IMAGE_CACHE_CONTROL, row.mediaType);
    })
    .delete("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const bucket = requireBucket(c.env, "Image");
        const userKey = await hashIdentifier(userId);

        await withRls(getDbClient(c.env), userId, async (tx) => {
            const [row] = await tx
                .select({ id: aiImages.id, mediaType: aiImages.mediaType })
                .from(aiImages)
                .where(and(eq(aiImages.id, id), eq(aiImages.userId, userId), isNull(aiImages.sentAt)))
                .limit(1);
            throwIfNotFound(row, "Image");
            await bucket.delete(aiImageKey(userKey, id, row.mediaType));
            await tx.delete(aiImages).where(and(eq(aiImages.id, id), eq(aiImages.userId, userId)));
        });

        return c.json({ data: { id, deleted: true } });
    });
