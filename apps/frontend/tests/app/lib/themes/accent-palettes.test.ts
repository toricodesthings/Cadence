import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { wcagContrast } from "culori/fn";
import "../../../../app/lib/themes/background-tokens"; // registers culori modes
import { ACCENT_PALETTES } from "../../../../app/lib/themes/accent-palettes";

const SURFACES = {
    twilight: ["#0f1d32", "#152540", "#1c2f50"],
    daylight: ["#ece8e2", "#e4dfd8", "#d8d1c8"],
};
const css = readFileSync(join(process.cwd(), "app/app.css"), "utf8");

/** The declarations of the first `[data-palette="id"]` block (or its daylight twin). */
function block(id: string, theme: "twilight" | "daylight"): string {
    if (id === "lantern") return "";
    const head = theme === "daylight" ? `[data-theme="daylight"][data-palette="${id}"]` : `[data-palette="${id}"]`;
    const start = css.indexOf(`${head} {`);
    return css.slice(start, css.indexOf("}", start));
}

describe.each(ACCENT_PALETTES)("$id palette", (palette) => {
    for (const theme of ["twilight", "daylight"] as const) {
        const colours = palette[theme];
        it(`${theme}: accents read on every panel surface`, () => {
            for (const key of ["primary", "secondary", "tertiary"] as const) {
                for (const surface of SURFACES[theme]) {
                    expect(wcagContrast(colours[key], surface), `${key} on ${surface}`).toBeGreaterThanOrEqual(4.5);
                }
            }
        });
        it(`${theme}: on-primary text reads on primary`, () => {
            expect(wcagContrast(colours.onPrimary, colours.primary)).toBeGreaterThanOrEqual(4.5);
        });
        it(`${theme}: TS values match app.css`, () => {
            const text = block(palette.id, theme);
            if (!text) return;
            for (const [prop, value] of [
                ["primary", colours.primary],
                ["secondary", colours.secondary],
                ["tertiary", colours.tertiary],
                ["on-primary", colours.onPrimary],
            ]) {
                expect(text).toContain(`--accent-${prop}: ${value};`);
            }
        });
    }
});
