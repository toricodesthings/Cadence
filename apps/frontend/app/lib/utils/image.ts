import imageCompression from "@miconvert/browser-image-compression";
import { BACKGROUND_IMAGE_LIMITS } from "@cadence/contracts/settings";

/**
 * Compresses an image file natively in the browser and returns a base64 Data URL.
 * Designed safely for limits like Neon Auth's avatar storage.
 * 
 * @param file The raw input file from an <input type="file" />
 * @param maxSizeMB Maximum size of returning image (default 0.1 / 100KB)
 * @param maxWidthOrHeight Hard limiter on height/width pixels
 * @returns {Promise<string>} A base64 resolving Data URI representation of the WEBP
 */
export async function compressImageToBase64(
    file: File,
    maxSizeMB: number = 0.1,
    maxWidthOrHeight: number = 256
): Promise<string> {
    const options = {
        maxSizeMB,
        maxWidthOrHeight,
        useWebWorker: true,
        fileType: "image/webp" as const
    };

    const compressedFile = await imageCompression(file, options);

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(compressedFile);
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

/**
 * Compress a user-selected photo for use as an app background.
 *
 * Re-encoding through a canvas also drops camera metadata (EXIF, including GPS)
 * before the file ever leaves the device. The server re-checks and strips again.
 *
 * @param file The raw input file from an <input type="file" />
 * @returns A WebP file sized for a large display
 */
export async function compressBackgroundImage(file: File): Promise<File> {
    return imageCompression(file, {
        maxSizeMB: 1.4,
        maxWidthOrHeight: BACKGROUND_IMAGE_LIMITS.maxDimension,
        initialQuality: 0.86,
        useWebWorker: true,
        fileType: "image/webp" as const,
    });
}

/**
 * Draw an image into a small offscreen canvas and read its pixels, for palette
 * extraction. Sampling small keeps the read cheap and blurs away noise.
 */
export async function readImagePixels(blob: Blob, size = 48): Promise<Uint8ClampedArray> {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable for reading image colors.");
        context.drawImage(bitmap, 0, 0, size, size);
        return context.getImageData(0, 0, size, size).data;
    } finally {
        bitmap.close();
    }
}

/** A decoded, orientation-corrected, display-sized copy of a photo the user picked. */
export interface CropSource {
    /** Normalized pixels, at most `maxDimension` on the long side. */
    canvas: HTMLCanvasElement;
    /** An object URL of the same pixels, for an `<img>` preview. */
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

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("Could not read that image."))),
            "image/webp",
            quality,
        );
    });
}

/** Free a canvas's backing store instead of waiting for the collector. */
function discardCanvas(canvas: HTMLCanvasElement): void {
    canvas.width = 0;
    canvas.height = 0;
}

/**
 * Decode a picked file into something the crop dialog can work with.
 *
 * `imageOrientation: "from-image"` bakes in EXIF rotation, so the crop someone
 * lines up is the crop we actually cut. Scaling down to the same ceiling the
 * upload uses keeps a 25MB phone photo from parking ~100MB of canvas on a
 * low-end device while they drag it around.
 */
export async function loadCropSource(file: File): Promise<CropSource> {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
        const limit = BACKGROUND_IMAGE_LIMITS.maxDimension;
        const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas is unavailable for preparing that image.");
        context.imageSmoothingQuality = "high";
        context.drawImage(bitmap, 0, 0, width, height);

        return { canvas, url: URL.createObjectURL(await canvasToBlob(canvas, 0.92)), width, height };
    } finally {
        bitmap.close();
    }
}

/** Release a crop source once its dialog closes. */
export function releaseCropSource(source: CropSource): void {
    URL.revokeObjectURL(source.url);
    discardCanvas(source.canvas);
}

/** Cut a region out of a crop source. The result still goes through compression. */
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
