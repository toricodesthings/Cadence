/**
 * Photos sent to the assistant: where they live, how a chat turn references
 * them, and how they reach the model.
 *
 * A turn never carries image bytes. It carries `cadence-image:<uuid>` file parts
 * (persisted as-is in `ai_messages.parts`); the route checks ownership and counts
 * new sends (`resolveTurnImages`), then swaps recent references for data URLs just
 * before the model call (`hydrateImages`). The scheme never matches a URL the
 * provider would fetch, so bytes only reach the model through this file.
 *
 * Object key: `ai-images/{userKey}/{imageId}.webp`, where `userKey` is the same
 * sha256 tenant key Redis uses and `imageId` is a random UUID (never the content
 * hash, which would let someone holding a known image confirm it is stored).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { CHAT_IMAGE_MEDIA_TYPE, parseChatImageUrl } from "@cadence/contracts/ai";
import { aiImages } from "../../../db/schema";
import { AppError } from "../../../platform/errors";
import type { Tx } from "../../../types/db";

// ── Utility ───────────────────────────────────────────────────────────

export const AI_IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable";

/** Days an image lives after it was last sent or re-attached. */
export const IMAGE_RETENTION_DAYS = 30;
/** Hours an attached-but-unsent image survives before the cron sweeps it. */
export const ORPHAN_HOURS = 24;
/** Extra days a reported image is kept, so there is time to look at it. */
export const REPORT_KEEP_DAYS = 14;
/** Only images in the last N messages reach the model; older ones become a stub. */
export const HYDRATE_WINDOW_MESSAGES = 6;

export const IMAGE_STUB_TEXT =
    "[An image the user shared earlier. It's no longer in view; ask them to share it again if you need it.]";

export function aiImageKey(userKey: string, imageId: string): string {
    return `ai-images/${userKey}/${imageId}.webp`;
}

export function imageExpired(): AppError {
    return new AppError(400, "IMAGE_NOT_FOUND", "That image expired — attach it again");
}

/** Image ids referenced by a message's file parts (the input guard has already vetted them). */
export function imageIdsIn(parts: unknown[]): string[] {
    const ids = parts.flatMap((part) => {
        const p = part as { type?: unknown; url?: unknown };
        const id = p?.type === "file" ? parseChatImageUrl(p.url) : null;
        return id ? [id] : [];
    });
    return [...new Set(ids)];
}

/** SHA-256 of the stored bytes, hex. The dedup key; never leaves the database. */
export async function contentHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

/** Delete stored objects, at most 1,000 keys per call (R2's batch limit). */
export async function deleteImageObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
}

// ── Update ────────────────────────────────────────────────────────────

/**
 * Check a turn's images and count how many are new sends. Every id must be an
 * image this user attached to this conversation; anything else (another user's,
 * expired, a different thread's) is `IMAGE_NOT_FOUND`. Images already sent
 * (regenerate, retry, edit) count zero.
 */
export async function resolveTurnImages(
    tx: Tx,
    userId: string,
    conversationId: string | undefined,
    ids: string[],
): Promise<{ newCount: number }> {
    if (ids.length === 0) return { newCount: 0 };
    if (!conversationId) throw imageExpired();
    const rows = await tx
        .select({ id: aiImages.id, sentAt: aiImages.sentAt })
        .from(aiImages)
        .where(and(eq(aiImages.userId, userId), eq(aiImages.conversationId, conversationId), inArray(aiImages.id, ids)));
    if (rows.length !== ids.length) throw imageExpired();
    return { newCount: rows.filter((row) => row.sentAt === null).length };
}

/** Stamp the turn's images as sent and push their expiry forward. */
export async function markSent(tx: Tx, userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx
        .update(aiImages)
        .set({ sentAt: sql`coalesce(${aiImages.sentAt}, now())`, lastUsedAt: sql`now()` })
        .where(and(eq(aiImages.userId, userId), inArray(aiImages.id, ids)));
}

// ── Read ──────────────────────────────────────────────────────────────

/** Unsent uploads the user has waiting (the pending cap). */
export async function countPending(tx: Tx, userId: string): Promise<number> {
    const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(aiImages)
        .where(and(eq(aiImages.userId, userId), isNull(aiImages.sentAt)));
    return row?.n ?? 0;
}

type Message = { role: string; parts: unknown[] };

/**
 * Swap `cadence-image:` references for what the model should see, once per turn:
 * images in the last `HYDRATE_WINDOW_MESSAGES` messages become data URLs (one
 * parallel R2 read each); older ones, and any the bucket no longer has, become a
 * text stub. Without the window every later turn would re-send every image.
 * Pure apart from the reads; never mutates its input.
 */
export async function hydrateImages<T extends Message>(
    messages: T[],
    bucket: R2Bucket | undefined,
    userKey: string,
): Promise<{ messages: T[]; hydrated: number }> {
    const windowStart = messages.length - HYDRATE_WINDOW_MESSAGES;
    const wanted = new Set<string>();
    messages.forEach((m, i) => {
        if (i >= windowStart) imageIdsIn(m.parts).forEach((id) => wanted.add(id));
    });

    const loaded = new Map<string, string>();
    if (bucket && wanted.size > 0) {
        await Promise.all(
            [...wanted].map(async (id) => {
                const object = await bucket.get(aiImageKey(userKey, id)).catch(() => null);
                if (object) loaded.set(id, `data:${CHAT_IMAGE_MEDIA_TYPE};base64,${toBase64(new Uint8Array(await object.arrayBuffer()))}`);
            }),
        );
    }

    let hydrated = 0;
    const out = messages.map((m, i) => {
        if (!m.parts.some((p) => (p as { type?: unknown })?.type === "file")) return m;
        const parts = m.parts.map((part) => {
            const p = part as { type?: unknown; url?: unknown };
            if (p?.type !== "file") return part;
            const id = parseChatImageUrl(p.url);
            const url = id && i >= windowStart ? loaded.get(id) : undefined;
            if (!url) return { type: "text", text: IMAGE_STUB_TEXT };
            hydrated++;
            return { type: "file", mediaType: CHAT_IMAGE_MEDIA_TYPE, url };
        });
        return { ...m, parts };
    });
    return { messages: out, hydrated };
}
