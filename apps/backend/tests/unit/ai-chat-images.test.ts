import { describe, expect, it } from "vitest";
import {
    aiImageKey,
    FILE_STUB_TEXT,
    hydrateImages,
    IMAGE_STUB_TEXT,
    imageIdsIn,
} from "../../src/domains/ai/images/chat-images";

const ids = [
    "0b9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b",
    "1c9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b",
    "2d9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b",
];
const file = (id: string) => ({ type: "file", mediaType: "image/webp", url: `cadence-image:${id}` });
const text = (t: string) => ({ type: "text", text: t });
const user = (...parts: unknown[]) => ({ role: "user", parts });
const assistant = () => ({ role: "assistant", parts: [text("ok")] });

/** R2 stand-in holding the given ids' bytes under user "u". */
function bucket(stored: string[]) {
    const reads: string[] = [];
    const objects = new Map(stored.map((id) => [aiImageKey("u", id), new Uint8Array([1, 2, 3])]));
    return {
        reads,
        get: async (key: string) => {
            reads.push(key);
            const bytes = objects.get(key);
            return bytes ? { arrayBuffer: async () => bytes.buffer } : null;
        },
    } as unknown as R2Bucket & { reads: string[] };
}

describe("hydrateImages", () => {
    it("inlines images in recent turns and stubs older ones", async () => {
        const exchange = (...parts: unknown[]) => [user(...parts), assistant()];
        const messages = [
            ...exchange(file(ids[0])),
            ...exchange(text("a")),
            ...exchange(text("b")),
            ...exchange(text("c")),
            ...exchange(text("d")),
            user(file(ids[1]), text("this?")),
        ];
        const r2 = bucket(ids);
        const { messages: out, hydrated } = await hydrateImages(messages, r2, "u");

        expect(out[0].parts[0]).toEqual({ type: "text", text: IMAGE_STUB_TEXT });
        expect(out[10].parts[0]).toEqual({ type: "file", mediaType: "image/webp", url: "data:image/webp;base64,AQID" });
        expect(out[10].parts[1]).toEqual(text("this?"));
        expect(hydrated).toBe(1);
        expect(r2.reads).toEqual([aiImageKey("u", ids[1])]); // the stubbed image is never read
        expect(messages[10].parts[0]).toEqual(file(ids[1])); // input untouched
    });

    it("keeps an image inlined until its turn compacts with the others", async () => {
        const messages = [user(file(ids[0])), assistant(), user(text("a")), assistant(), user(text("b"))];
        const { messages: out } = await hydrateImages(messages, bucket(ids), "u");
        expect(out[0].parts[0]).toMatchObject({ type: "file" });
    });

    it("stubs an image storage no longer has (expired)", async () => {
        const { messages: out } = await hydrateImages([user(file(ids[2]))], bucket([]), "u");
        expect(out[0].parts[0]).toEqual({ type: "text", text: IMAGE_STUB_TEXT });
    });

    it("stubs everything when storage isn't configured", async () => {
        const { messages: out } = await hydrateImages([user(file(ids[0]))], undefined, "u");
        expect(out[0].parts[0]).toEqual({ type: "text", text: IMAGE_STUB_TEXT });
    });
});

describe("hydrateImages with a PDF", () => {
    const pdf = (id: string) => ({ type: "file", mediaType: "application/pdf", url: `cadence-image:${id}` });

    it("reads the .pdf object and inlines it with its own type; an old one gets the PDF stub", async () => {
        const objects = new Map([[aiImageKey("u", ids[0], "application/pdf"), new Uint8Array([1, 2, 3])]]);
        const r2 = {
            get: async (key: string) =>
                objects.has(key) ? { arrayBuffer: async () => objects.get(key)!.buffer } : null,
        } as unknown as R2Bucket;
        const { messages: out } = await hydrateImages([user(pdf(ids[0]))], r2, "u");
        expect(out[0].parts[0]).toEqual({
            type: "file",
            mediaType: "application/pdf",
            url: "data:application/pdf;base64,AQID",
        });

        const old = [
            user(pdf(ids[1])),
            assistant(),
            ...Array.from({ length: 5 }, () => [user(text("a")), assistant()]).flat(),
            user(text("now")),
        ];
        const { messages: stubbed } = await hydrateImages(old, r2, "u");
        expect(stubbed[0].parts[0]).toEqual({ type: "text", text: FILE_STUB_TEXT });
    });
});

describe("chat image keys", () => {
    it("dedupes referenced ids", () => {
        expect(imageIdsIn([file(ids[0]), file(ids[0]), text("x")])).toEqual([ids[0]]);
    });
});
