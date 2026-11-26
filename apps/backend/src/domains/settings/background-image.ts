export const BACKGROUND_CACHE_CONTROL = "private, max-age=31536000, immutable";

export const BACKGROUND_MAX_DIMENSION = 4096;

export function backgroundPrefix(userId: string): string {
    return `backgrounds/${userId}/`;
}

export function backgroundObjectKey(userId: string, id: string): string {
    return `${backgroundPrefix(userId)}${id}.webp`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
export function sanitizeBackgroundPatch<T extends Record<string, any>>(stored: Record<string, any>, patch: T): T {
    const appearance = patch.appearance;
    if (!appearance || typeof appearance !== "object") return patch;

    const hasImage = Boolean(stored.appearance?.backgroundImage);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
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
