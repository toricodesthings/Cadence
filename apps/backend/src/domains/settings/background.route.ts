import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { uuidParamSchema } from "@cadence/contracts/common";
import {
    BACKGROUND_IMAGE_DEFAULTS,
    BACKGROUND_IMAGE_LIMITS,
    backgroundUploadMetaSchema,
} from "@cadence/contracts/settings";
import { users } from "../../db/schema";
import type { AuthVariables } from "../../platform/auth";
import { getDbClient } from "../../platform/db";
import { AppError, throwIfNotFound } from "../../platform/errors";
import { checkIdempotency, getIdempotencyKey, recordMutation } from "../../platform/idempotency";
import { hashIdentifier, logger } from "../../platform/log";
import { getRequestId } from "../../platform/request-log";
import { withRls } from "../../platform/rls";
import { apiValidator } from "../../platform/validation";
import type { Tx } from "../../types/db";
import type { Env } from "../../types/env";
import { sanitizeStillWebp } from "../../platform/webp";
import {
    BACKGROUND_CACHE_CONTROL,
    BACKGROUND_MAX_DIMENSION,
    backgroundObjectKey,
    backgroundPrefix,
} from "./background-image";
import type { SettingsView } from "@cadence/contracts/settings";
import { normalizeSettings } from "./settings.route";

/**
 * The user's photo background. One photo per account: an upload replaces the
 * previous one. Objects live in the private `USER_ASSETS` bucket under a
 * per-user prefix and are only ever served back to their owner through this
 * authenticated route — the bucket has no public URL.
 */

/** Multipart overhead on top of the file itself. */
const UPLOAD_BODY_SLACK = 64 * 1024;

const uploadFormSchema = backgroundUploadMetaSchema.extend({ file: z.instanceof(File) });

function requireBucket(env: Env): R2Bucket {
    if (!env.USER_ASSETS) {
        throw new AppError(503, "STORAGE_UNAVAILABLE", "Background storage is not available right now", true);
    }
    return env.USER_ASSETS;
}

async function readSettings(tx: Tx, userId: string): Promise<SettingsView> {
    const [user] = await tx
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    return normalizeSettings((user?.settings ?? {}) as Record<string, any>);
}

async function writeSettings(tx: Tx, userId: string, settings: Record<string, any>): Promise<SettingsView> {
    const [row] = await tx
        .update(users)
        .set({ settings })
        .where(eq(users.id, userId))
        .returning({ settings: users.settings });
    return normalizeSettings((row?.settings ?? {}) as Record<string, any>);
}

/** Delete every stored background for the user except `keepId`. */
async function deleteBackgrounds(bucket: R2Bucket, userId: string, keepId?: string): Promise<void> {
    const keep = keepId ? backgroundObjectKey(userId, keepId) : null;
    let cursor: string | undefined;
    do {
        const page = await bucket.list({ prefix: backgroundPrefix(userId), cursor });
        const keys = page.objects.map((object) => object.key).filter((key) => key !== keep);
        if (keys.length > 0) await bucket.delete(keys);
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
}

export const backgroundRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .post(
        "/",
        bodyLimit({
            maxSize: BACKGROUND_IMAGE_LIMITS.maxBytes + UPLOAD_BODY_SLACK,
            onError: () => {
                throw new AppError(413, "IMAGE_TOO_LARGE", "Background image is too large");
            },
        }),
        apiValidator("form", uploadFormSchema),
        async (c) => {
            const userId = c.get("userId");
            const { file, dominant, swatches } = c.req.valid("form");
            if (file.size > BACKGROUND_IMAGE_LIMITS.maxBytes) {
                throw new AppError(413, "IMAGE_TOO_LARGE", "Background image is too large");
            }
            const { bytes } = sanitizeStillWebp(new Uint8Array(await file.arrayBuffer()), {
                maxDimension: BACKGROUND_MAX_DIMENSION,
                label: "Background image",
            });
            const bucket = requireBucket(c.env);
            const idempotencyKey = getIdempotencyKey(c);
            const db = getDbClient(c.env);

            const replayed = await withRls(db, userId, async (tx) =>
                (await checkIdempotency(tx, userId, idempotencyKey)) ? readSettings(tx, userId) : null,
            );
            if (replayed) return c.json({ data: replayed }, 201);

            const id = crypto.randomUUID();
            const key = backgroundObjectKey(userId, id);
            await bucket.put(key, bytes, {
                httpMetadata: { contentType: "image/webp", cacheControl: BACKGROUND_CACHE_CONTROL },
            });

            let settings: SettingsView;
            try {
                settings = await withRls(db, userId, async (tx) => {
                    const current = await readSettings(tx, userId);
                    const previous = current.appearance?.backgroundImage ?? null;
                    const saved = await writeSettings(tx, userId, {
                        ...current,
                        appearance: {
                            ...current.appearance,
                            backgroundMode: "image",
                            backgroundImage: {
                                id,
                                dominant,
                                swatches,
                                accent: null,
                                blur: previous?.blur ?? BACKGROUND_IMAGE_DEFAULTS.blur,
                                brightness: previous?.brightness ?? BACKGROUND_IMAGE_DEFAULTS.brightness,
                            },
                        },
                    });
                    await recordMutation(tx, userId, idempotencyKey, id);
                    return saved;
                });
            } catch (error) {
                await bucket.delete(key).catch(() => undefined);
                throw error;
            }

            // Replacement: the new photo is saved, so the old one goes. A failure here
            // leaves an orphan that the next upload or delete sweeps up.
            await deleteBackgrounds(bucket, userId, id).catch(async (error) => {
                logger.warn("storage", "background_cleanup_failed", {
                    requestId: getRequestId(c),
                    userHash: await hashIdentifier(userId),
                    message: error instanceof Error ? error.message : String(error),
                });
            });

            return c.json({ data: settings }, 201);
        },
    )
    .get("/:id", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const bucket = requireBucket(c.env);

        // The key is built from the caller's own user id, so one user can never read another's photo.
        const object = await bucket.get(backgroundObjectKey(userId, id), { onlyIf: c.req.raw.headers });
        throwIfNotFound(object, "Background");

        const headers = {
            "Content-Type": "image/webp",
            "Cache-Control": BACKGROUND_CACHE_CONTROL,
            ETag: object.httpEtag,
            "Content-Security-Policy": "default-src 'none'; sandbox",
        };
        if (!("body" in object)) return c.body(null, 304, headers);
        return c.body(object.body, 200, headers);
    })
    .delete("/", async (c) => {
        const userId = c.get("userId");
        const bucket = requireBucket(c.env);
        const db = getDbClient(c.env);

        // Storage first: if it fails, settings still point at the photo and the user can retry.
        await deleteBackgrounds(bucket, userId);

        const settings = await withRls(db, userId, async (tx) => {
            const current = await readSettings(tx, userId);
            const appearance = current.appearance ?? {};
            return writeSettings(tx, userId, {
                ...current,
                appearance: {
                    ...appearance,
                    backgroundImage: null,
                    backgroundMode: appearance.backgroundMode === "image" ? "theme" : appearance.backgroundMode,
                },
            });
        });

        return c.json({ data: settings });
    });
