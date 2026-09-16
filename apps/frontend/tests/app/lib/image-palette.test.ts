import { describe, expect, it } from "vitest";
import {
    autoAccent,
    blurPixels,
    derivePhotoAccentTokens,
    derivePhotoTone,
    ensureAccentContrast,
    extractPhotoPalette,
    hexToHsl,
    hslToHex,
} from "../../../app/lib/themes/image-palette";
import { relativeLuminance } from "../../../app/lib/themes/background-tokens";

/** Build RGBA pixels from a list of [r, g, b, count] runs. */
function pixels(...runs: Array<[number, number, number, number]>): Uint8ClampedArray {
    const data: number[] = [];
    for (const [r, g, b, count] of runs) {
        for (let i = 0; i < count; i += 1) data.push(r, g, b, 255);
    }
    return new Uint8ClampedArray(data);
}

function contrast(a: string, b: string): number {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
}

describe("extractPhotoPalette", () => {
    it("averages the photo into a dominant tone", () => {
        const palette = extractPhotoPalette(pixels([0, 0, 0, 50], [255, 255, 255, 50]));
        expect(palette.dominant).toBe("#808080");
    });

    it("prefers colourful candidates over the most common dull one", () => {
        // Mostly near-black sky with a smaller orange lantern.
        const palette = extractPhotoPalette(pixels([10, 12, 20, 900], [232, 164, 74, 100]));
        const [hue, saturation] = hexToHsl(palette.swatches[0]);
        expect(saturation).toBeGreaterThan(0.4);
        expect(hue).toBeGreaterThan(20);
        expect(hue).toBeLessThan(50);
    });

    it("never returns two swatches of the same hue", () => {
        const palette = extractPhotoPalette(
            pixels([232, 164, 74, 200], [235, 170, 80, 200], [90, 140, 220, 200], [120, 200, 130, 200]),
        );
        const hues = palette.swatches.map((swatch) => hexToHsl(swatch)[0]);
        for (let i = 0; i < hues.length; i += 1) {
            for (let j = i + 1; j < hues.length; j += 1) {
                const distance = Math.abs(hues[i] - hues[j]);
                expect(Math.min(distance, 360 - distance)).toBeGreaterThanOrEqual(25);
            }
        }
    });

    it("still offers an accent for a photo with no colour", () => {
        const palette = extractPhotoPalette(pixels([128, 128, 128, 500]));
        expect(palette.swatches.length).toBeGreaterThanOrEqual(1);
        expect(hexToHsl(palette.swatches[0])[1]).toBeGreaterThan(0.2);
    });

    it("falls back when every pixel is transparent", () => {
        expect(extractPhotoPalette(new Uint8ClampedArray([10, 20, 30, 0])).swatches).toHaveLength(1);
    });
});

describe("derivePhotoTone", () => {
    it("runs the interface dark over a dark photo and light over a bright one", () => {
        expect(derivePhotoTone("#101828", 100).isDark).toBe(true);
        expect(derivePhotoTone("#f2efe9", 100).isDark).toBe(false);
    });

    it("lets the brightness setting flip a midtone photo", () => {
        const dimmed = derivePhotoTone("#8a8f99", 30);
        expect(dimmed.isDark).toBe(true);
    });

    it("keeps the surface clear of the unreadable midtones", () => {
        for (const hex of ["#101828", "#8a8f99", "#f2efe9", "#7a4420"]) {
            const tone = derivePhotoTone(hex, 100);
            const luminance = relativeLuminance(tone.base);
            expect(tone.isDark ? luminance < 0.06 : luminance > 0.75).toBe(true);
        }
    });
});

describe("accents", () => {
    it("lifts a too-dark accent until it reads on a dark surface", () => {
        const tone = derivePhotoTone("#101828", 100);
        const accent = ensureAccentContrast("#2a1a12", tone.base);
        expect(contrast(accent, tone.base)).toBeGreaterThanOrEqual(4.5);
    });

    it("darkens a too-light accent on a light surface", () => {
        const tone = derivePhotoTone("#f2efe9", 100);
        const accent = ensureAccentContrast("#fffbe8", tone.base);
        expect(contrast(accent, tone.base)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps an accent's hue while fixing its contrast", () => {
        const tone = derivePhotoTone("#101828", 100);
        const before = hexToHsl("#7a4420")[0];
        const after = hexToHsl(ensureAccentContrast("#7a4420", tone.base))[0];
        expect(Math.abs(after - before)).toBeLessThan(6);
    });

    it("builds the full accent token set with readable on-primary text", () => {
        const tone = derivePhotoTone("#101828", 100);
        const tokens = derivePhotoAccentTokens(autoAccent(["#e8a44a", "#7eb8d4"], tone.base), ["#e8a44a", "#7eb8d4"], tone);
        for (const name of ["--accent-primary", "--accent-secondary", "--accent-glow", "--accent-on-primary"]) {
            expect(tokens[name]).toBeTruthy();
        }
        expect(contrast(tokens["--accent-primary"], tokens["--accent-on-primary"])).toBeGreaterThan(2.5);
    });
});

describe("hsl round trip", () => {
    it("survives a conversion back and forth", () => {
        for (const hex of ["#e8a44a", "#7eb8d4", "#101828", "#ffffff", "#000000"]) {
            const [h, s, l] = hexToHsl(hex);
            expect(hslToHex(h, s, l)).toBe(hex);
        }
    });
});

describe("blurPixels", () => {
    it("maps the percentage onto the pixel range and clamps", () => {
        expect(blurPixels(0)).toBe(0);
        expect(blurPixels(50)).toBe(20);
        expect(blurPixels(100)).toBe(40);
        expect(blurPixels(140)).toBe(40);
    });
});
