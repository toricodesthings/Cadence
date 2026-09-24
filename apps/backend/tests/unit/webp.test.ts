import { describe, expect, it } from "vitest";
import { sanitizeStillWebp } from "../../src/platform/webp";

const clean = (bytes: Uint8Array, maxDimension = 4096) =>
    sanitizeStillWebp(bytes, { maxDimension, label: "Image" }).bytes;

function u32(value: number): number[] {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function chunk(type: string, payload: number[]): number[] {
    const bytes = [...type].map((ch) => ch.charCodeAt(0)).concat(u32(payload.length), payload);
    return payload.length % 2 ? [...bytes, 0] : bytes;
}

function webp(...chunks: number[][]): Uint8Array {
    const body = chunks.flat();
    return new Uint8Array([..."RIFF"].map((ch) => ch.charCodeAt(0)).concat(u32(body.length + 4), [..."WEBP"].map((ch) => ch.charCodeAt(0)), body));
}

/** VP8L payload: signature, 14-bit (w-1), 14-bit (h-1), then filler bits. */
function vp8l(width: number, height: number): number[] {
    const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
    return [0x2f, ...u32(bits), 0, 0, 0];
}

function vp8x(flags: number, width: number, height: number): number[] {
    const w = width - 1;
    const h = height - 1;
    return [flags, 0, 0, 0, w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff];
}

function chunkTypes(bytes: Uint8Array): string[] {
    const types: string[] = [];
    for (let offset = 12; offset + 8 <= bytes.length;) {
        types.push(String.fromCharCode(...bytes.subarray(offset, offset + 4)));
        const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
        offset += 8 + size + (size % 2);
    }
    return types;
}

describe("sanitizeStillWebp", () => {
    it("keeps a simple still WebP intact", () => {
        const input = webp(chunk("VP8L", vp8l(1920, 1080)));
        expect(Array.from(clean(input))).toEqual(Array.from(input));
    });

    it("strips EXIF, XMP and unknown chunks and clears their flags", () => {
        const input = webp(
            chunk("VP8X", vp8x(0x08 | 0x04 | 0x20, 1920, 1080)),
            chunk("ICCP", [1, 2, 3]),
            chunk("VP8L", vp8l(1920, 1080)),
            chunk("EXIF", [9, 9, 9, 9, 9]),
            chunk("XMP ", [7, 7]),
            chunk("ZZZZ", [1]),
        );
        const output = clean(input);

        expect(chunkTypes(output)).toEqual(["VP8X", "ICCP", "VP8L"]);
        expect(output[20] & 0x0c).toBe(0); // EXIF + XMP flags cleared
        expect(output[20] & 0x20).toBe(0x20); // ICC flag kept
        const riffSize = output[4] | (output[5] << 8) | (output[6] << 16) | (output[7] << 24);
        expect(riffSize).toBe(output.length - 8);
    });

    it("rejects files that are not WebP", () => {
        const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: 20 }, () => 0)]);
        expect(() => clean(png)).toThrow(expect.objectContaining({ code: "UNSUPPORTED_IMAGE" }));
    });

    it("rejects animated WebP", () => {
        const input = webp(chunk("VP8X", vp8x(0x02, 100, 100)), chunk("ANIM", [0, 0, 0, 0, 0, 0]), chunk("VP8L", vp8l(100, 100)));
        expect(() => clean(input)).toThrow(expect.objectContaining({ code: "UNSUPPORTED_IMAGE" }));
    });

    it("rejects truncated chunks", () => {
        const input = webp(chunk("VP8L", vp8l(100, 100)));
        expect(() => clean(input.subarray(0, input.length - 3))).toThrow(
            expect.objectContaining({ code: "UNSUPPORTED_IMAGE" }),
        );
    });

    it("rejects images larger than 4096px on a side", () => {
        const input = webp(chunk("VP8L", vp8l(8000, 1000)));
        expect(() => clean(input)).toThrow(expect.objectContaining({ code: "IMAGE_TOO_LARGE" }));
    });

    it("honours the caller's dimension cap and reports the size", () => {
        const input = webp(chunk("VP8L", vp8l(2100, 900)));
        expect(() => clean(input, 2048)).toThrow(expect.objectContaining({ code: "IMAGE_TOO_LARGE" }));
        const out = sanitizeStillWebp(webp(chunk("VP8L", vp8l(1600, 900))), { maxDimension: 2048, label: "Image" });
        expect([out.width, out.height]).toEqual([1600, 900]);
    });
});
