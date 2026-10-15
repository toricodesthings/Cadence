import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex } from "../../../app/lib/themes/image-palette";
import { relativeLuminance } from "../../../app/lib/themes/background-tokens";

/** Pinned from the hand-written colour maths before it moved to culori: luminance, hex → HSL, and HSL → the same hex. */
const TABLE: [hex: string, luminance: number, hsl: [number, number, number]][] = [
    ["#000000", 0, [0, 0, 0]],
    ["#ffffff", 1, [0, 0, 1]],
    ["#808080", 0.2158605001138992, [0, 0, 0.5019607843137255]],
    ["#ff0000", 0.2126, [0, 1, 0.5]],
    ["#00ff00", 0.7152, [120, 1, 0.5]],
    ["#0000ff", 0.0722, [240, 1, 0.5]],
    ["#ffff00", 0.9278, [60, 1, 0.5]],
    ["#00ffff", 0.7874, [180, 1, 0.5]],
    ["#ff00ff", 0.2848, [300, 1, 0.5]],
    ["#e8a44a", 0.4420113629183601, [34.17721518987342, 0.7745098039215687, 0.6]],
    ["#b45309", 0.15909534581060447, [25.964912280701753, 0.9047619047619048, 0.37058823529411766]],
];

describe("colour arithmetic", () => {
    it.each(TABLE)("%s keeps its luminance, HSL and round trip", (hex, luminance, hsl) => {
        expect(relativeLuminance(hex)).toBeCloseTo(luminance, 12);
        const got = hexToHsl(hex);
        hsl.forEach((value, i) => expect(got[i]).toBeCloseTo(value, 9));
        expect(hslToHex(...hsl)).toBe(hex);
    });
});
