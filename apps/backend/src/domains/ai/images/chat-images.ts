import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { CHAT_IMAGE_MEDIA_TYPE, CHAT_PDF_MEDIA_TYPE, parseChatImageUrl } from "@cadence/contracts/ai";
import { aiImages } from "../../../db/schema";
import { AppError } from "../../../platform/errors";
import type { Tx } from "../../../types/db";
import { recentStart } from "../persistence/message-mapper";

export const AI_IMAGE_CACHE_CONTROL = "private, max-age=31536000, immutable";

export const IMAGE_RETENTION_DAYS = 30;
export const ORPHAN_HOURS = 24;
export const REPORT_KEEP_DAYS = 14;
export const IMAGE_STUB_TEXT =
    "[An image the user shared earlier. It's no longer in view; ask them to share it again if you need it.]";

export const FILE_STUB_TEXT = "[A PDF was here; it's no longer in this conversation's recent view.]";

export type ChatFileType = typeof CHAT_IMAGE_MEDIA_TYPE | typeof CHAT_PDF_MEDIA_TYPE;

export function aiImageKey(userKey: string, imageId: string, mediaType: ChatFileType = CHAT_IMAGE_MEDIA_TYPE): string {
    return `ai-images/${userKey}/${imageId}.${mediaType === CHAT_PDF_MEDIA_TYPE ? "pdf" : "webp"}`;
}

export function imageExpired(): AppError {
    return new AppError(400, "IMAGE_NOT_FOUND", "That file expired — attach it again");
}

export function imageIdsIn(parts: unknown[]): string[] {
    const ids = parts.flatMap((part) => {
        const p = part as { type?: unknown; url?: unknown };
        const id = p?.type === "file" ? parseChatImageUrl(p.url) : null;
        return id ? [id] : [];
    });
    return [...new Set(ids)];
}

export function imageTypesIn(parts: unknown[]): Map<string, string> {
    const types = new Map<string, string>();
    for (const part of parts) {
        const p = part as { type?: unknown; url?: unknown; mediaType?: unknown };
        const id = p?.type === "file" ? parseChatImageUrl(p.url) : null;
        if (id && typeof p.mediaType === "string") types.set(id, p.mediaType);
    }
    return types;
}

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

export async function deleteImageObjects(bucket: R2Bucket, keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) await bucket.delete(keys.slice(i, i + 1000));
}

export async function resolveTurnImages(
    tx: Tx,
    userId: string,
    conversationId: string | undefined,
    ids: string[],
    mediaTypes?: Map<string, string>,
): Promise<{ newCount: number }> {
    if (ids.length === 0) return { newCount: 0 };
    if (!conversationId) throw imageExpired();
    const rows = await tx
        .select({ id: aiImages.id, sentAt: aiImages.sentAt, mediaType: aiImages.mediaType })
        .from(aiImages)
        .where(
            and(eq(aiImages.userId, userId), eq(aiImages.conversationId, conversationId), inArray(aiImages.id, ids)),
        );
    if (rows.length !== ids.length) throw imageExpired();
    if (mediaTypes && rows.some((row) => mediaTypes.get(row.id) !== row.mediaType)) throw imageExpired();
    return { newCount: rows.filter((row) => row.sentAt === null).length };
}

export async function markSent(tx: Tx, userId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await tx
        .update(aiImages)
        .set({ sentAt: sql`coalesce(${aiImages.sentAt}, now())`, lastUsedAt: sql`now()` })
        .where(and(eq(aiImages.userId, userId), inArray(aiImages.id, ids)));
}

export async function countPending(tx: Tx, userId: string): Promise<number> {
    const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(aiImages)
        .where(and(eq(aiImages.userId, userId), isNull(aiImages.sentAt)));
    return row?.n ?? 0;
}

type Message = { role: string; parts: unknown[] };

export async function hydrateImages<T extends Message>(
    messages: T[],
    bucket: R2Bucket | undefined,
    userKey: string,
    from = recentStart(messages),
): Promise<{ messages: T[]; hydrated: number }> {
    const wanted = new Set<string>();
    messages.forEach((m, i) => {
        if (i >= from) imageIdsIn(m.parts).forEach((id) => wanted.add(id));
    });

    const types = new Map<string, ChatFileType>();
    messages.forEach((m, i) => {
        if (i >= from)
            for (const [id, type] of imageTypesIn(m.parts))
                types.set(id, type === CHAT_PDF_MEDIA_TYPE ? CHAT_PDF_MEDIA_TYPE : CHAT_IMAGE_MEDIA_TYPE);
    });

    const loaded = new Map<string, string>();
    if (bucket && wanted.size > 0) {
        await Promise.all(
            [...wanted].map(async (id) => {
                const type = types.get(id) ?? CHAT_IMAGE_MEDIA_TYPE;
                const object = await bucket.get(aiImageKey(userKey, id, type)).catch(() => null);
                if (object)
                    loaded.set(id, `data:${type};base64,${toBase64(new Uint8Array(await object.arrayBuffer()))}`);
            }),
        );
    }

    let hydrated = 0;
    const out = messages.map((m, i) => {
        if (!m.parts.some((p) => (p as { type?: unknown })?.type === "file")) return m;
        const parts = m.parts.map((part) => {
            const p = part as { type?: unknown; url?: unknown; mediaType?: unknown };
            if (p?.type !== "file") return part;
            const id = parseChatImageUrl(p.url);
            const url = id && i >= from ? loaded.get(id) : undefined;
            if (!url)
                return { type: "text", text: p.mediaType === CHAT_PDF_MEDIA_TYPE ? FILE_STUB_TEXT : IMAGE_STUB_TEXT };
            hydrated++;
            return { type: "file", mediaType: types.get(id!) ?? CHAT_IMAGE_MEDIA_TYPE, url };
        });
        return { ...m, parts };
    });
    return { messages: out, hydrated };
}
