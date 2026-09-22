import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs, createTestApp } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { backgroundRoutes } from "../../src/domains/settings/background.route";
import { settingsRoutes } from "../../src/domains/settings/settings.route";

beforeAll(startTestDb);

const settings = (userId: string) => apiAs(userId, "/settings", settingsRoutes);

/** Smallest valid still WebP: a VP8L chunk with a 2×2 header. */
const TINY_WEBP = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x16, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    0x56, 0x50, 0x38, 0x4c, 0x08, 0, 0, 0, 0x2f, 0x01, 0x40, 0, 0, 0, 0, 0,
    0x45, 0x58, 0x49, 0x46, 0x02, 0, 0, 0, 0xaa, 0xbb,
]);

/** In-memory stand-in for the R2 binding (only what the route uses). */
function createBucket() {
    const objects = new Map<string, Uint8Array>();
    const bucket = {
        objects,
        put: vi.fn(async (key: string, value: Uint8Array) => {
            objects.set(key, value);
        }),
        get: vi.fn(async (key: string) => {
            const value = objects.get(key);
            if (!value) return null;
            return { body: new Blob([value]).stream(), httpEtag: '"etag"' };
        }),
        list: vi.fn(async ({ prefix }: { prefix: string }) => ({
            objects: [...objects.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })),
            truncated: false,
        })),
        delete: vi.fn(async (keys: string | string[]) => {
            for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
        }),
    };
    return bucket;
}

function uploadForm(bytes: Uint8Array = TINY_WEBP) {
    const form = new FormData();
    form.set("file", new File([bytes], "background.webp", { type: "image/webp" }));
    form.set("dominant", "#1a2233");
    form.set("swatches", "#e8a44a,#7eb8d4");
    return form;
}

describe("background routes", () => {
    let bucket: ReturnType<typeof createBucket>;
    let userId: string;
    let createApp: (as?: string) => ReturnType<typeof createTestApp>;

    beforeEach(async () => {
        bucket = createBucket();
        userId = await createUser();
        createApp = (as = userId) => createTestApp("/settings/background", backgroundRoutes, as);
    });

    it("stores a sanitized photo privately and switches to image mode", async () => {
        const res = await createApp().request("/settings/background", { method: "POST", body: uploadForm() }, { USER_ASSETS: bucket });
        expect(res.status).toBe(201);

        const body = (await res.json()) as { data: any };
        const image = body.data.appearance.backgroundImage;
        expect(body.data.appearance.backgroundMode).toBe("image");
        expect(image).toMatchObject({ dominant: "#1a2233", swatches: ["#e8a44a", "#7eb8d4"], accent: null, blur: 0, brightness: 80 });

        const key = `backgrounds/${userId}/${image.id}.webp`;
        expect([...bucket.objects.keys()]).toEqual([key]);
        // The trailing EXIF chunk was stripped before storage.
        expect(bucket.objects.get(key)!.length).toBe(TINY_WEBP.length - 10);
    });

    it("replaces the previous photo and keeps its adjustments", async () => {
        const app = createApp();
        await app.request("/settings/background", { method: "POST", body: uploadForm() }, { USER_ASSETS: bucket });
        await settings(userId)("PATCH", "", { appearance: { backgroundImage: { blur: 30 } } });

        const res = await app.request("/settings/background", { method: "POST", body: uploadForm() }, { USER_ASSETS: bucket });
        const image = ((await res.json()) as { data: any }).data.appearance.backgroundImage;

        expect(bucket.objects.size).toBe(1);
        expect([...bucket.objects.keys()][0]).toContain(image.id);
        expect(image.blur).toBe(30);
    });

    it("rejects files that are not WebP without storing anything", async () => {
        const res = await createApp().request(
            "/settings/background",
            { method: "POST", body: uploadForm(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(30).fill(0)])) },
            { USER_ASSETS: bucket },
        );
        expect(res.status).toBe(415);
        expect(bucket.put).not.toHaveBeenCalled();
    });

    it("rejects malformed swatches", async () => {
        const form = uploadForm();
        form.set("swatches", "red,blue");
        const res = await createApp().request("/settings/background", { method: "POST", body: form }, { USER_ASSETS: bucket });
        expect(res.status).toBe(400);
    });

    it("serves the photo only to its owner", async () => {
        const upload = await createApp().request("/settings/background", { method: "POST", body: uploadForm() }, { USER_ASSETS: bucket });
        const id = ((await upload.json()) as { data: any }).data.appearance.backgroundImage.id;

        const own = await createApp().request(`/settings/background/${id}`, {}, { USER_ASSETS: bucket });
        expect(own.status).toBe(200);
        expect(own.headers.get("Content-Type")).toBe("image/webp");
        expect(own.headers.get("Cache-Control")).toContain("private");

        const other = await createApp(await createUser()).request(`/settings/background/${id}`, {}, { USER_ASSETS: bucket });
        expect(other.status).toBe(404);
    });

    it("deletes the photo and returns to the theme background", async () => {
        const app = createApp();
        await app.request("/settings/background", { method: "POST", body: uploadForm() }, { USER_ASSETS: bucket });

        const res = await app.request("/settings/background", { method: "DELETE" }, { USER_ASSETS: bucket });
        const appearance = ((await res.json()) as { data: any }).data.appearance;

        expect(res.status).toBe(200);
        expect(bucket.objects.size).toBe(0);
        expect(appearance.backgroundImage).toBeNull();
        expect(appearance.backgroundMode).toBe("theme");
    });

    it("answers 503 when storage is not configured", async () => {
        const res = await createApp().request("/settings/background", { method: "DELETE" }, {});
        expect(res.status).toBe(503);
    });
});
