import encode, { init } from "@jsquash/webp/encode.js";
import wasmUrl from "@jsquash/webp/codec/enc/webp_enc.wasm?url";
import simdWasmUrl from "@jsquash/webp/codec/enc/webp_enc_simd.wasm?url";

let ready: Promise<unknown> | undefined;

export async function encodeWebpPixels(pixels: ImageData, quality: number): Promise<Blob> {
    ready ??= init({ locateFile: (file: string) => (file.endsWith("_simd.wasm") ? simdWasmUrl : wasmUrl) }).catch(
        (error) => {
            ready = undefined;
            throw error;
        },
    );
    await ready;
    return new Blob([await encode(pixels, { quality: quality * 100 })], { type: "image/webp" });
}
