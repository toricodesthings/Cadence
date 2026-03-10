import imageCompression from "@miconvert/browser-image-compression";

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
