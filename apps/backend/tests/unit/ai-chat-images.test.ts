import { describe, expect, it } from "vitest";
import { aiImageKey, hydrateImages, IMAGE_STUB_TEXT, imageIdsIn } from "../../src/domains/ai/images/chat-images";

const ids = ["0b9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b", "1c9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b", "2d9f7a3e-2c4d-4e6f-8a1b-3c5d7e9f1a2b"];
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
    it("inlines images in the last six messages and stubs older ones", async () => {
        const messages = [user(file(ids[0])), assistant(), user(text("a")), assistant(), user(text("b")), assistant(), user(file(ids[1]), text("this?"))];
        const r2 = bucket(ids);
        const { messages: out, hydrated } = await hydrateImages(messages, r2, "u");

        expect(out[0].parts[0]).toEqual({ type: "text", text: IMAGE_STUB_TEXT });
        expect(out[6].parts[0]).toEqual({ type: "file", mediaType: "image/webp", url: "data:image/webp;base64,AQID" });
        expect(out[6].parts[1]).toEqual(text("this?"));
        expect(hydrated).toBe(1);
        expect(r2.reads).toEqual([aiImageKey("u", ids[1])]); // the stubbed image is never read
        expect(messages[6].parts[0]).toEqual(file(ids[1])); // input untouched
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

describe("chat image keys", () => {
    it("dedupes referenced ids", () => {
        expect(imageIdsIn([file(ids[0]), file(ids[0]), text("x")])).toEqual([ids[0]]);
    });
});
