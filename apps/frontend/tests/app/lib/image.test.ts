import { Blob, File } from "node:buffer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_IMAGE_LIMITS } from "@cadence/contracts/ai";
import { compressChatImage } from "../../../app/lib/utils/image";

const { encodeWebpPixels } = vi.hoisted(() => ({ encodeWebpPixels: vi.fn() }));
vi.mock("../../../app/lib/utils/webp-encoder", () => ({ encodeWebpPixels }));

const bitmap = { width: 1200, height: 2400, close: vi.fn() };
const pixels = { width: 800, height: 1600, data: new Uint8ClampedArray(4) };
const context = { drawImage: vi.fn(), getImageData: vi.fn(() => pixels), imageSmoothingQuality: "low" };
const webp = () => new Blob(["RIFF-output-WEBP"], { type: "image/webp" });
const file = () => new File(["source"], "screenshot.jxl", { type: "image/jxl" }) as unknown as globalThis.File;
let canvases: HTMLCanvasElement[];

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Blob", Blob);
    vi.stubGlobal("File", File);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:picked-image"), revokeObjectURL: vi.fn() });
    encodeWebpPixels.mockResolvedValue(webp());
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    canvases = [];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback) {
        canvases.push(this);
        callback(webp() as unknown as globalThis.Blob);
    });
});

describe("Assistant image preparation", () => {
    it("keeps native WebP encoding and scales a portrait screenshot before releasing it", async () => {
        const result = await compressChatImage(file());
        expect(result.type).toBe("image/webp");
        expect(result.name).toBe("image.webp");
        expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 800, 1600);
        expect(encodeWebpPixels).not.toHaveBeenCalled();
        expect(bitmap.close).toHaveBeenCalledOnce();
        expect(canvases[0].width).toBe(0);
        expect(canvases[0].height).toBe(0);
    });

    it("replaces Safari's silent PNG fallback with encoded WebP bytes", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
            callback(new Blob(["PNG bytes"], { type: "image/png" }) as unknown as globalThis.Blob);
        });
        const result = await compressChatImage(file());
        expect(encodeWebpPixels).toHaveBeenCalledWith(pixels, 0.82);
        expect(await result.text()).toBe("RIFF-output-WEBP");
        expect(result.type).toBe("image/webp");
    });

    it("steps down fallback quality until the output fits the upload limit", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
            callback(new Blob(["PNG"], { type: "image/png" }) as unknown as globalThis.Blob);
        });
        encodeWebpPixels.mockResolvedValueOnce(new Blob([new Uint8Array(CHAT_IMAGE_LIMITS.maxBytes + 1)]));
        const result = await compressChatImage(file());
        expect(encodeWebpPixels.mock.calls.map((call) => call[1])).toEqual([0.82, 0.7]);
        expect(result.size).toBeLessThanOrEqual(CHAT_IMAGE_LIMITS.maxBytes);
    });

    it("rejects output still over the byte limit after every quality attempt", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
            callback(new Blob([new Uint8Array(CHAT_IMAGE_LIMITS.maxBytes + 1)], { type: "image/webp" }) as unknown as globalThis.Blob);
        });
        await expect(compressChatImage(file())).rejects.toThrow("too detailed");
        expect(bitmap.close).toHaveBeenCalledOnce();
    });

    it("uses the browser's image decoder when ImageBitmap rejects the picked format", async () => {
        vi.mocked(createImageBitmap).mockRejectedValue(new Error("Unsupported bitmap format"));
        const image = { naturalWidth: 1200, naturalHeight: 2400, src: "", decode: vi.fn().mockResolvedValue(undefined), removeAttribute: vi.fn() };
        vi.stubGlobal("Image", class { constructor() { return image; } });
        await compressChatImage(file());
        expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 800, 1600);
        expect(image.decode).toHaveBeenCalledOnce();
        expect(image.removeAttribute).toHaveBeenCalledWith("src");
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked-image");
    });

    it("releases the local URL if neither decoder can read the image", async () => {
        vi.mocked(createImageBitmap).mockRejectedValue(new Error("Unsupported bitmap format"));
        const removeAttribute = vi.fn();
        vi.stubGlobal("Image", class {
            src = "";
            decode = vi.fn().mockRejectedValue(new Error("Unreadable"));
            removeAttribute = removeAttribute;
        });
        await expect(compressChatImage(file())).rejects.toThrow("Couldn’t read that image.");
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:picked-image");
        expect(removeAttribute).toHaveBeenCalledWith("src");
    });

    it("rejects oversized originals before decoding or downloading the encoder", async () => {
        const oversized = new File([new Uint8Array(CHAT_IMAGE_LIMITS.maxOriginalBytes + 1)], "large.png") as unknown as globalThis.File;
        await expect(compressChatImage(oversized)).rejects.toThrow("25 MB");
        expect(createImageBitmap).not.toHaveBeenCalled();
        expect(encodeWebpPixels).not.toHaveBeenCalled();
    });

    it("releases the bitmap and canvas if canvas encoding fails", async () => {
        vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, callback) {
            canvases.push(this);
            callback(null);
        });
        await expect(compressChatImage(file())).rejects.toThrow("Couldn’t read that image.");
        expect(bitmap.close).toHaveBeenCalledOnce();
        expect(canvases[0].width).toBe(0);
        expect(canvases[0].height).toBe(0);
    });
});
