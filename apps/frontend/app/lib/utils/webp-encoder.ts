import encode, { init } from "@jsquash/webp/encode.js";
import wasmUrl from "@jsquash/webp/codec/enc/webp_enc.wasm?url";
import simdWasmUrl from "@jsquash/webp/codec/enc/webp_enc_simd.wasm?url";

// Vite emits hashed, same-origin assets. Share initialization between concurrent
// attachments, and allow a retry if the first download failed.
let ready: Promise<unknown> | undefined;

/** Loaded only when the browser cannot encode WebP through canvas. */
export async function encodeWebpPixels(pixels: ImageData, quality: number): Promise<Blob> {
    ready ??= init({ locateFile: (file: string) => file.endsWith("_simd.wasm") ? simdWasmUrl : wasmUrl }).catch((error) => {
        ready = undefined;
        throw error;
    });
    await ready;
    return new Blob([await encode(pixels, { quality: quality * 100 })], { type: "image/webp" });
}
