/**
 * Photo background storage rules: where a user's photo lives in R2, how large
 * it may be, and which background fields a settings PATCH may touch. The bytes
 * themselves go through `sanitizeStillWebp` (`platform/webp.ts`).
 */

export const BACKGROUND_CACHE_CONTROL = "private, max-age=31536000, immutable";

/** Longest edge we store. Clients resize to 2560; the slack covers rounding. */
export const BACKGROUND_MAX_DIMENSION = 4096;

export function backgroundPrefix(userId: string): string {
    return `backgrounds/${userId}/`;
}

export function backgroundObjectKey(userId: string, id: string): string {
    return `${backgroundPrefix(userId)}${id}.webp`;
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
