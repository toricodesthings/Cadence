/**
 * Photo background storage rules: where a user's photo lives in R2, what bytes
 * we accept, and which background fields a settings PATCH may touch.
 *
 * The client re-encodes every photo to WebP before upload (which drops camera
 * metadata), but the server never trusts that: `sanitizeBackgroundWebp` accepts
 * only a still WebP and rebuilds it without EXIF/XMP or unknown chunks.
 */
import { AppError } from "../../platform/errors";

export const BACKGROUND_CACHE_CONTROL = "private, max-age=31536000, immutable";

/** Longest edge we store. Clients resize to 2560; the slack covers rounding. */
const MAX_DIMENSION = 4096;

/** Chunks a still WebP may carry. Everything else (EXIF, XMP, ANIM, ANMF, unknown) is dropped or rejected. */
const KEPT_CHUNKS = new Set(["VP8X", "ICCP", "ALPH", "VP8 ", "VP8L"]);
const IMAGE_CHUNKS = new Set(["VP8 ", "VP8L"]);
const VP8X_FLAG_ANIMATION = 0x02;
const VP8X_FLAG_XMP = 0x04;
const VP8X_FLAG_EXIF = 0x08;

export function backgroundPrefix(userId: string): string {
    return `backgrounds/${userId}/`;
}

export function backgroundObjectKey(userId: string, id: string): string {
    return `${backgroundPrefix(userId)}${id}.webp`;
}

function unsupported(message = "Background must be a still WebP image"): AppError {
    return new AppError(415, "UNSUPPORTED_IMAGE", message);
}

function fourcc(bytes: Uint8Array, offset: number): string {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function readU32(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readU24(bytes: Uint8Array, offset: number): number {
    return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function writeU32(bytes: Uint8Array, offset: number, value: number) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
}

/** Width/height of the bitstream in an image chunk's payload, or null if unreadable. */
function bitstreamDimensions(type: string, payload: Uint8Array): { width: number; height: number } | null {
    if (type === "VP8 ") {
        // Frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
        if (payload.length < 10 || payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) return null;
        return {
            width: (payload[6] | (payload[7] << 8)) & 0x3fff,
            height: (payload[8] | (payload[9] << 8)) & 0x3fff,
        };
    }
    // VP8L: signature 0x2f, then 14-bit (width - 1) and 14-bit (height - 1).
    if (payload.length < 5 || payload[0] !== 0x2f) return null;
    const bits = readU32(payload, 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

type Chunk = { type: string; start: number; end: number };

/**
 * Validate a WebP and return a copy without metadata chunks.
 * Throws `UNSUPPORTED_IMAGE` (415) for anything that is not one still WebP frame
 * within the size limits.
 */
export function sanitizeBackgroundWebp(bytes: Uint8Array): Uint8Array {
    if (bytes.length < 20 || fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WEBP") throw unsupported();
    const riffEnd = Math.min(bytes.length, readU32(bytes, 4) + 8);

    const chunks: Chunk[] = [];
    for (let offset = 12; offset + 8 <= riffEnd;) {
        const type = fourcc(bytes, offset);
        const size = readU32(bytes, offset + 4);
        const end = offset + 8 + size;
        if (end > riffEnd) throw unsupported("Background image is truncated");
        chunks.push({ type, start: offset, end });
        offset = end + (size % 2); // chunks are padded to an even length
    }

    if (chunks.some((chunk) => chunk.type === "ANIM" || chunk.type === "ANMF")) {
        throw unsupported("Animated images can't be used as a background");
    }
    const images = chunks.filter((chunk) => IMAGE_CHUNKS.has(chunk.type));
    if (images.length !== 1) throw unsupported();

    const image = images[0];
    const dims = bitstreamDimensions(image.type, bytes.subarray(image.start + 8, image.end));
    if (!dims || dims.width === 0 || dims.height === 0) throw unsupported();
    if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
        throw new AppError(413, "IMAGE_TOO_LARGE", `Background images can be at most ${MAX_DIMENSION}px on a side`);
    }

    const kept = chunks.filter((chunk) => KEPT_CHUNKS.has(chunk.type));
    const padded = (chunk: Chunk) => chunk.end - chunk.start + ((chunk.end - chunk.start) % 2);
    const out = new Uint8Array(12 + kept.reduce((sum, chunk) => sum + padded(chunk), 0));
    out.set(bytes.subarray(0, 12), 0);

    let cursor = 12;
    for (const chunk of kept) {
        out.set(bytes.subarray(chunk.start, chunk.end), cursor);
        if (chunk.type === "VP8X") {
            const flags = cursor + 8;
            if (out[flags] & VP8X_FLAG_ANIMATION) throw unsupported("Animated images can't be used as a background");
            out[flags] &= ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
            const canvasWidth = readU24(out, cursor + 12) + 1;
            const canvasHeight = readU24(out, cursor + 15) + 1;
            if (canvasWidth > MAX_DIMENSION || canvasHeight > MAX_DIMENSION) {
                throw new AppError(413, "IMAGE_TOO_LARGE", `Background images can be at most ${MAX_DIMENSION}px on a side`);
            }
        }
        cursor += padded(chunk);
    }
    writeU32(out, 4, out.length - 8);
    return out;
}

/**
 * A settings PATCH may adjust how the stored photo looks (accent, blur,
 * brightness) but never which photo it is: `id`, the read colours and the
 * existence of `backgroundImage` belong to the upload and delete routes.
 * `backgroundMode: "image"` is dropped while there is no photo to show.
 */
export function sanitizeBackgroundPatch<T extends Record<string, any>>(stored: Record<string, any>, patch: T): T {
    const appearance = patch.appearance;
    if (!appearance || typeof appearance !== "object") return patch;

    const hasImage = Boolean(stored.appearance?.backgroundImage);
    const next: Record<string, any> = { ...appearance };

    if ("backgroundImage" in next) {
        const requested = next.backgroundImage;
        delete next.backgroundImage;
        if (hasImage && requested && typeof requested === "object") {
            const adjustments: Record<string, unknown> = {};
            for (const key of ["accent", "blur", "brightness"] as const) {
                if (requested[key] !== undefined) adjustments[key] = requested[key];
            }
            if (Object.keys(adjustments).length > 0) next.backgroundImage = adjustments;
        }
    }
    if (next.backgroundMode === "image" && !hasImage) delete next.backgroundMode;

    return { ...patch, appearance: next };
}
