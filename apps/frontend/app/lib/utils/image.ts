import { BACKGROUND_IMAGE_LIMITS } from "@cadence/contracts/settings";
import { CHAT_IMAGE_LIMITS } from "@cadence/contracts/ai";
import { log } from "../log";

/** WebKit can display some phone formats that its ImageBitmap decoder rejects. */
async function decodeImage(file: Blob) {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
        const image = new Image();
        const url = URL.createObjectURL(file);
        const close = () => {
            image.removeAttribute("src");
            URL.revokeObjectURL(url);
        };
        try {
            image.src = url;
            await image.decode();
            return { source: image, width: image.naturalWidth, height: image.naturalHeight, close };
        } catch (error) {
            close();
            throw error;
        }
    }
}

async function encodeWebp(file: Blob, maxDimension: number, qualities: number[], maxBytes = Infinity): Promise<Blob> {
    const image = await decodeImage(file);
    const canvas = document.createElement("canvas");
    try {
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable for preparing that image.");
        context.imageSmoothingQuality = "high";
        context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
        let blob!: Blob;
        for (const quality of qualities) {
            blob = await canvasToBlob(canvas, quality);
            if (blob.size <= maxBytes) break;
        }
        return blob;
    } finally {
        image.close();
        discardCanvas(canvas);
    }
}

export async function compressImageToBase64(file: File): Promise<string> {
    const compressed = await encodeWebp(file, 256, [0.8]);

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(compressed);
        reader.onloadend = () => {
            if (typeof reader.result === "string") {
                resolve(reader.result);
            } else {
                reject(new Error("Failed to convert compressed image to base64."));
            }
        };
        reader.onerror = reject;
    });
}

export async function compressBackgroundImage(file: File): Promise<File> {
    const blob = await encodeWebp(
        file,
        BACKGROUND_IMAGE_LIMITS.maxDimension,
        [0.86, 0.72, 0.58],
        BACKGROUND_IMAGE_LIMITS.maxBytes,
    );
    return new File([blob], "background.webp", { type: "image/webp" });
}

export async function compressChatImage(file: File): Promise<File> {
    if (file.size > CHAT_IMAGE_LIMITS.maxOriginalBytes) throw new Error("That photo is too large (25 MB at most).");
    let blob: Blob;
    try {
        blob = await encodeWebp(file, CHAT_IMAGE_LIMITS.maxDimension, [0.82, 0.7, 0.55], CHAT_IMAGE_LIMITS.maxBytes);
    } catch (error) {
        log.error("image", `Couldn’t prepare a chat image (${file.type || "unknown type"})`, error);
        throw new Error("Couldn’t read that photo.");
    }
    if (blob.size > CHAT_IMAGE_LIMITS.maxBytes) throw new Error("That photo is too detailed to send. Try a crop.");
    return new File([blob], "image.webp", { type: "image/webp" });
}

export async function readImagePixels(blob: Blob, size = 48): Promise<Uint8ClampedArray> {
    const image = await decodeImage(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable for reading image colors.");
        context.drawImage(image.source, 0, 0, size, size);
        return context.getImageData(0, 0, size, size).data;
    } finally {
        image.close();
    }
}

export interface CropSource {
    canvas: HTMLCanvasElement;
    url: string;
    width: number;
    height: number;
}

export interface CropRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

async function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image."))),
            "image/webp",
            quality,
        );
    });
    if (blob.type === "image/webp") return blob;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for preparing that image.");
    const { encodeWebpPixels } = await import("./webp-encoder");
    return encodeWebpPixels(context.getImageData(0, 0, canvas.width, canvas.height), quality);
}

function discardCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
}

export async function loadCropSource(file: File): Promise<CropSource> {
    const image = await decodeImage(file);
    try {
        const limit = BACKGROUND_IMAGE_LIMITS.maxDimension;
        const scale = Math.min(1, limit / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable for preparing that image.");
        context.imageSmoothingQuality = "high";
        context.drawImage(image.source, 0, 0, width, height);

        return { canvas, url: URL.createObjectURL(await canvasToBlob(canvas, 0.92)), width, height };
    } finally {
        image.close();
    }
}

export function releaseCropSource(source: CropSource): void {
    URL.revokeObjectURL(source.url);
    discardCanvas(source.canvas);
}

export async function cropImage(source: CropSource, rect: CropRect): Promise<File> {
    const limit = BACKGROUND_IMAGE_LIMITS.maxDimension;
    const scale = Math.min(1, limit / Math.max(rect.width, rect.height));
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for cropping that image.");
    context.imageSmoothingQuality = "high";
    context.drawImage(source.canvas, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height);

    try {
        return new File([await canvasToBlob(canvas, 0.95)], "background.webp", { type: "image/webp" });
    } finally {
        discardCanvas(canvas);
    }
}
