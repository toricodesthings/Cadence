import { AppError } from "./errors";
import type { Env } from "../types/env";

const KEPT_CHUNKS = new Set(["VP8X", "ICCP", "ALPH", "VP8 ", "VP8L"]);
const IMAGE_CHUNKS = new Set(["VP8 ", "VP8L"]);
const VP8X_FLAG_ANIMATION = 0x02;
const VP8X_FLAG_XMP = 0x04;
const VP8X_FLAG_EXIF = 0x08;

function unsupported(message: string): AppError {
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

function bitstreamDimensions(type: string, payload: Uint8Array): { width: number; height: number } | null {
    if (type === "VP8 ") {
        if (payload.length < 10 || payload[3] !== 0x9d || payload[4] !== 0x01 || payload[5] !== 0x2a) return null;
        return {
            width: (payload[6] | (payload[7] << 8)) & 0x3fff,
            height: (payload[8] | (payload[9] << 8)) & 0x3fff,
        };
    }
    if (payload.length < 5 || payload[0] !== 0x2f) return null;
    const bits = readU32(payload, 1);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
}

type Chunk = { type: string; start: number; end: number };

export interface StillWebpOptions {
    maxDimension: number;
    label: string;
}

function readChunks(bytes: Uint8Array, label: string): Chunk[] {
    const riffEnd = Math.min(bytes.length, readU32(bytes, 4) + 8);
    const chunks: Chunk[] = [];
    for (let offset = 12; offset + 8 <= riffEnd;) {
        const type = fourcc(bytes, offset);
        const size = readU32(bytes, offset + 4);
        const end = offset + 8 + size;
        if (end > riffEnd) throw unsupported(`${label} is truncated`);
        chunks.push({ type, start: offset, end });
        offset = end + (size % 2);
    }
    return chunks;
}

function webpErrors(label: string, maxDimension: number) {
    return {
        notStill: () => unsupported(`${label} must be a still WebP image`),
        animated: () => unsupported(`${label} can't be animated`),
        tooLarge: () => new AppError(413, "IMAGE_TOO_LARGE", `${label} can be at most ${maxDimension}px on a side`),
    };
}

function stillDimensions(bytes: Uint8Array, chunks: Chunk[], label: string, maxDimension: number) {
    const { notStill, animated, tooLarge } = webpErrors(label, maxDimension);
    if (chunks.some((chunk) => chunk.type === "ANIM" || chunk.type === "ANMF")) throw animated();
    const images = chunks.filter((chunk) => IMAGE_CHUNKS.has(chunk.type));
    if (images.length !== 1) throw notStill();

    const image = images[0];
    const dims = bitstreamDimensions(image.type, bytes.subarray(image.start + 8, image.end));
    if (!dims || dims.width === 0 || dims.height === 0) throw notStill();
    if (dims.width > maxDimension || dims.height > maxDimension) throw tooLarge();
    return dims;
}

export function sanitizeStillWebp(
    bytes: Uint8Array,
    { maxDimension, label }: StillWebpOptions,
): { bytes: Uint8Array<ArrayBuffer>; width: number; height: number } {
    const { notStill, animated, tooLarge } = webpErrors(label, maxDimension);
    if (bytes.length < 20 || fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WEBP") throw notStill();
    const chunks = readChunks(bytes, label);
    const dims = stillDimensions(bytes, chunks, label, maxDimension);

    const kept = chunks.filter((chunk) => KEPT_CHUNKS.has(chunk.type));
    const padded = (chunk: Chunk) => chunk.end - chunk.start + ((chunk.end - chunk.start) % 2);
    const out = new Uint8Array(12 + kept.reduce((sum, chunk) => sum + padded(chunk), 0));
    out.set(bytes.subarray(0, 12), 0);

    let cursor = 12;
    for (const chunk of kept) {
        out.set(bytes.subarray(chunk.start, chunk.end), cursor);
        if (chunk.type === "VP8X") {
            const flags = cursor + 8;
            if (out[flags] & VP8X_FLAG_ANIMATION) throw animated();
            out[flags] &= ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
            const canvasWidth = readU24(out, cursor + 12) + 1;
            const canvasHeight = readU24(out, cursor + 15) + 1;
            if (canvasWidth > maxDimension || canvasHeight > maxDimension) throw tooLarge();
        }
        cursor += padded(chunk);
    }
    writeU32(out, 4, out.length - 8);
    return { bytes: out, width: dims.width, height: dims.height };
}

export function requireBucket(env: Env, what: string): R2Bucket {
    if (!env.USER_ASSETS) {
        throw new AppError(503, "STORAGE_UNAVAILABLE", `${what} storage is not available right now`, true);
    }
    return env.USER_ASSETS;
}

export function webpResponse(
    object: R2ObjectBody | R2Object,
    cacheControl: string,
    contentType = "image/webp",
): Response {
    const headers = {
        "Content-Type": contentType,
        ...(contentType === "application/pdf" && { "Content-Disposition": "attachment" }),
        "Cache-Control": cacheControl,
        ETag: object.httpEtag,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
    };
    return "body" in object
        ? new Response(object.body, { status: 200, headers })
        : new Response(null, { status: 304, headers });
}
