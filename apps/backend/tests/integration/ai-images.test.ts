import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs, createTestApp } from "../helpers/app";
import { asOwner, createUser, getTestDb, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { aiImageRoutes } from "../../src/domains/ai/images/images.route";
import { aiRoutes } from "../../src/domains/ai/ai.route";
import { markSent, resolveTurnImages } from "../../src/domains/ai/images/chat-images";
import { resolveOrCreateConversation } from "../../src/domains/ai/persistence/conversation-repo";
import { pruneAiImages } from "../../src/cron/overdue-check";
import { hashIdentifier } from "../../src/platform/log";
import { withRls } from "../../src/platform/rls";

beforeAll(startTestDb);

/** A still VP8L WebP of the given size (distinct sizes → distinct bytes → distinct hashes). */
function webp(width = 2, height = 2): Uint8Array {
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
    const payload = [0x2f, bits & 0xff, (bits >>> 8) & 0xff, (bits >>> 16) & 0xff, (bits >>> 24) & 0xff, 0, 0, 0];
    const chunk = [0x56, 0x50, 0x38, 0x4c, payload.length, 0, 0, 0, ...payload];
    const size = chunk.length + 4;
    return new Uint8Array([0x52, 0x49, 0x46, 0x46, size, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...chunk]);
}

/** In-memory stand-in for the R2 binding (only what the routes use). */
function createBucket() {
    const objects = new Map<string, Uint8Array>();
    return {
        objects,
        put: vi.fn(async (key: string, value: Uint8Array, _options?: unknown) => void objects.set(key, value)),
        get: vi.fn(async (key: string) => {
            const value = objects.get(key);
            return value
                ? { body: new Blob([value]).stream(), httpEtag: '"e"', arrayBuffer: async () => value.buffer }
                : null;
        }),
        delete: vi.fn(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
        }),
    };
}

const rows = (userId: string) =>
    asOwner(
        async (pg) =>
            (await pg.query<any>("SELECT * FROM ai_images WHERE user_id = $1 ORDER BY created_at", [userId])).rows,
    );

describe("chat images", () => {
    let bucket: ReturnType<typeof createBucket>;
    let userId: string;
    let conversationId: string;
    let env: Record<string, unknown>;

    beforeEach(async () => {
        bucket = createBucket();
        userId = await createUser();
        conversationId = crypto.randomUUID();
        env = { USER_ASSETS: bucket, AI_IMAGES_MAX_PENDING: "2" };
    });

    async function upload(as = userId, bytes: Uint8Array = webp(), convo = conversationId, type = "image/webp") {
        const form = new FormData();
        form.set("file", new File([bytes], "IMG_0001.webp", { type }));
        form.set("conversationId", convo);
        const res = await createTestApp("/ai/images", aiImageRoutes, as).request(
            "/ai/images",
            { method: "POST", body: form },
            env,
        );
        return { status: res.status, body: (await res.json()) as any };
    }

    it("reuses the same bytes in one conversation, never across conversations", async () => {
        const first = await upload();
        const again = await upload();
        const elsewhere = await upload(userId, webp(), crypto.randomUUID());

        expect(first.status).toBe(201);
        expect(first.body.data).toMatchObject({ reused: false, images: { used: 0, limit: 40 } });
        expect(again).toMatchObject({ status: 200, body: { data: { id: first.body.data.id, reused: true } } });
        expect(elsewhere.body.data.id).not.toBe(first.body.data.id);
        expect(bucket.put).toHaveBeenCalledTimes(2);
    });

    it("stores under the hashed user key and a random id: never the raw user id, the hash or the filename", async () => {
        const { body } = await upload();
        const [key] = [...bucket.objects.keys()];
        const [row] = await rows(userId);

        expect(key).toBe(`ai-images/${await hashIdentifier(userId)}/${body.data.id}.webp`);
        expect(key).not.toContain(userId);
        expect(key).not.toContain(row.content_hash);
        expect(bucket.put.mock.calls[0][2]).toEqual({
            httpMetadata: { contentType: "image/webp", cacheControl: expect.any(String) },
        });
    });

    it("caps unsent uploads, and removing one frees its slot", async () => {
        const a = await upload(userId, webp(2, 2));
        await upload(userId, webp(3, 3));
        const third = await upload(userId, webp(4, 4));
        expect(third.status).toBe(429);
        expect(third.body.error.code).toBe("AI_IMAGE_PENDING_LIMIT");

        const images = apiAs(userId, "/ai/images", aiImageRoutes, env);
        expect((await images("DELETE", `/${a.body.data.id}`)).status).toBe(200);
        expect(bucket.objects.size).toBe(1);
        expect((await upload(userId, webp(4, 4))).status).toBe(201);
    });

    it("rejects anything that isn't a still WebP", async () => {
        const res = await upload(
            userId,
            new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...Array.from({ length: 30 }, () => 0)]),
        );
        expect(res.status).toBe(415);
        expect(bucket.put).not.toHaveBeenCalled();
    });

    it("serves an image only to its owner", async () => {
        const { body } = await upload();
        const other = await createUser();

        const mine = await apiAs(userId, "/ai/images", aiImageRoutes, env)("GET", `/${body.data.id}`);
        const theirs = await apiAs(other, "/ai/images", aiImageRoutes, env)("GET", `/${body.data.id}`);

        expect(mine.status).toBe(200);
        expect(mine.response.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
        expect(theirs.status).toBe(404);
    });

    it("refuses a chat turn that references another user's image", async () => {
        const { body } = await upload();
        const other = await createUser();
        const res = await apiAs(
            other,
            "/ai",
            aiRoutes,
            env,
        )("POST", "/chat", {
            conversationId,
            currentDate: new Date().toISOString(),
            message: {
                id: "m1",
                role: "user",
                parts: [{ type: "file", mediaType: "image/webp", url: `cadence-image:${body.data.id}` }],
            },
        });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("IMAGE_NOT_FOUND");
    });

    it("counts a send once: a regenerate re-sends it for free", async () => {
        const { body } = await upload();
        const ids = [body.data.id];
        const db = getTestDb();

        expect(await withRls(db, userId, (tx) => resolveTurnImages(tx, userId, conversationId, ids))).toEqual({
            newCount: 1,
        });
        await withRls(db, userId, (tx) => markSent(tx, userId, ids));
        expect(await withRls(db, userId, (tx) => resolveTurnImages(tx, userId, conversationId, ids))).toEqual({
            newCount: 0,
        });
        // Sent images belong to the thread: they can no longer be removed as a draft.
        expect((await apiAs(userId, "/ai/images", aiImageRoutes, env)("DELETE", `/${body.data.id}`)).status).toBe(404);
    });

    it("keeps a reported image for two more weeks", async () => {
        const { body } = await upload();
        const res = await apiAs(
            userId,
            "/ai/images",
            aiImageRoutes,
            env,
        )("POST", `/${body.data.id}/report`, { requestId: "req-1" });
        const [row] = await rows(userId);

        expect(res.status).toBe(200);
        expect(row.diagnostics_shared_at).not.toBeNull();
        expect(new Date(row.last_used_at).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    });

    it("deleting a conversation deletes its images, storage and rows", async () => {
        await withRls(getTestDb(), userId, (tx) => resolveOrCreateConversation(tx, userId, { conversationId }));
        await upload();
        await upload(userId, webp(5, 5), crypto.randomUUID()); // another thread's image stays

        const res = await apiAs(userId, "/ai", aiRoutes, env)("DELETE", `/conversations/${conversationId}`);

        expect(res.status).toBe(200);
        expect(bucket.objects.size).toBe(1);
        expect((await rows(userId)).map((r) => r.conversation_id)).not.toContain(conversationId);
    });

    it("clearing the archive deletes archived threads' images, storage and rows", async () => {
        await withRls(getTestDb(), userId, (tx) => resolveOrCreateConversation(tx, userId, { conversationId }));
        await upload();
        await upload(userId, webp(5, 5), crypto.randomUUID()); // an active thread's image stays
        const ai = apiAs(userId, "/ai", aiRoutes, env);
        await ai("PATCH", `/conversations/${conversationId}`, { archived: true });

        expect((await ai("DELETE", "/conversations/archived")).body.data).toEqual({ deleted: 1 });
        expect(bucket.objects.size).toBe(1);
        expect((await rows(userId)).map((r) => r.conversation_id)).not.toContain(conversationId);
    });

    describe("PDFs", () => {
        const pdf = (pages = 3, extra = "") =>
            new TextEncoder().encode(
                `%PDF-1.4\n1 0 obj\n<< /Type /Pages /Kids [] /Count ${pages} >>\nendobj\n${extra}`,
            );
        const uploadPdf = (bytes: Uint8Array, as = userId, convo = conversationId) =>
            upload(as, bytes, convo, "application/pdf");

        it("stores a PDF with its page count, dedups it, and serves it as a download", async () => {
            const first = await uploadPdf(pdf(3));
            const again = await uploadPdf(pdf(3));

            expect(first).toMatchObject({ status: 201, body: { data: { mediaType: "application/pdf", pages: 3 } } });
            expect(again).toMatchObject({
                status: 200,
                body: { data: { id: first.body.data.id, reused: true, pages: 3 } },
            });
            expect([...bucket.objects.keys()]).toEqual([
                `ai-images/${await hashIdentifier(userId)}/${first.body.data.id}.pdf`,
            ]);
            const [row] = await rows(userId);
            expect(row).toMatchObject({ media_type: "application/pdf", pages: 3, width: null, height: null });

            const got = await apiAs(userId, "/ai/images", aiImageRoutes, env)("GET", `/${first.body.data.id}`);
            expect(got.response.headers.get("Content-Type")).toBe("application/pdf");
            expect(got.response.headers.get("Content-Disposition")).toBe("attachment");
            expect(got.response.headers.get("X-Content-Type-Options")).toBe("nosniff");
        });

        it("refuses locked, too-long, oversized and non-PDF files", async () => {
            expect((await uploadPdf(pdf(2, "<< /Encrypt 4 0 R >>"))).body.error.code).toBe("FILE_LOCKED");
            expect((await uploadPdf(pdf(31))).body.error.code).toBe("FILE_TOO_LONG");
            expect((await uploadPdf(new TextEncoder().encode("not a pdf"))).status).toBe(415);
            const big = new Uint8Array(6 * 1024 * 1024);
            big.set(pdf(1));
            expect((await uploadPdf(big)).status).toBe(413);
            expect(bucket.put).not.toHaveBeenCalled();
        });

        it("another user gets 404; delete while unsent removes the object; a part can't change its type", async () => {
            const { body } = await uploadPdf(pdf(2));
            const other = await createUser();
            expect((await apiAs(other, "/ai/images", aiImageRoutes, env)("GET", `/${body.data.id}`)).status).toBe(404);

            const ids = [body.data.id];
            const db = getTestDb();
            await expect(
                withRls(db, userId, (tx) =>
                    resolveTurnImages(tx, userId, conversationId, ids, new Map([[body.data.id, "image/webp"]])),
                ),
            ).rejects.toMatchObject({ code: "IMAGE_NOT_FOUND" });

            expect((await apiAs(userId, "/ai/images", aiImageRoutes, env)("DELETE", `/${body.data.id}`)).status).toBe(
                200,
            );
            expect(bucket.objects.size).toBe(0);
        });

        it("deleting the conversation removes the .pdf object", async () => {
            await withRls(getTestDb(), userId, (tx) => resolveOrCreateConversation(tx, userId, { conversationId }));
            await uploadPdf(pdf(2));
            await apiAs(userId, "/ai", aiRoutes, env)("DELETE", `/conversations/${conversationId}`);
            expect(bucket.objects.size).toBe(0);
        });
    });

    it("the cron sweeps unsent uploads after a day and images unused for 30 days", async () => {
        const orphan = (await upload(userId, webp(2, 2))).body.data.id;
        const stale = (await upload(userId, webp(3, 3))).body.data.id;
        const age = (sql: string, id: string) => asOwner((pg) => pg.query(sql, [id]));
        await age(
            "UPDATE ai_images SET sent_at = now(), last_used_at = now() - interval '31 days' WHERE id = $1",
            stale,
        );
        const fresh = (await upload(userId, webp(6, 6), crypto.randomUUID())).body.data.id;
        await age("UPDATE ai_images SET created_at = now() - interval '25 hours' WHERE id = $1", orphan);
        await age("UPDATE ai_images SET sent_at = now() WHERE id = $1", fresh);

        await pruneAiImages(env as any);

        expect((await rows(userId)).map((r) => r.id)).toEqual([fresh]);
        expect([...bucket.objects.keys()]).toEqual([`ai-images/${await hashIdentifier(userId)}/${fresh}.webp`]);
    });
});
