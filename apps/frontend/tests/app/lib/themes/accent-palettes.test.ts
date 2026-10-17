import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatHex, interpolate, parse, wcagContrast, type Rgb } from "culori/fn";
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

/** What a theme's floating glass and accent fill sit on: panel-raised, menu text, the worst solid backdrop. */
const THEMES = {
    twilight: { panel: "#0f1d32", text: "#b8c5d4", opposite: "#ffffff" },
    daylight: { panel: "#ece8e2", text: "#475569", opposite: "#111111" },
};
/** A custom property's value in the first rule whose selector is exactly `selector`. */
function token(selector: string, prop: string): string {
    const re = new RegExp(`(^|\\n)${selector.replace(/[[\]().*"=]/g, "\\$&")} \\{[^}]*--${prop}: ([^;]+);`);
    const match = css.match(re);
    if (!match) throw new Error(`${selector} has no --${prop}`);
    return match[2].trim();
}
const rgb = (hex: string) => parse(hex) as Rgb;
/** `top` at `alpha` over `under`, where the backdrop has been through brightness(`k`). */
function over(top: string, alpha: number, under: string, k: number): string {
    const a = rgb(top);
    const b = rgb(under);
    const mix = (x: "r" | "g" | "b") => a[x] * alpha + Math.min(1, b[x] * k) * (1 - alpha);
    return formatHex({ mode: "rgb", r: mix("r"), g: mix("g"), b: mix("b") });
}

describe("floating glass legibility", () => {
    const pinned = {
        twilight: { tint: token(":root", "floating-tint"), brightness: token(":root", "floating-brightness") },
        daylight: { tint: token('[data-theme="daylight"]', "floating-tint"), brightness: token('[data-theme="daylight"]', "floating-brightness") },
    };
    it("pins the values this test passes at", () => {
        expect(pinned).toEqual({
            twilight: { tint: "74%", brightness: "0.92" },
            daylight: { tint: "85%", brightness: "1.04" },
        });
    });
    for (const theme of ["twilight", "daylight"] as const) {
        it(`${theme}: menu text reads over the accent, its opposite and the panel`, () => {
            const { panel, text, opposite } = THEMES[theme];
            const tint = parseFloat(pinned[theme].tint) / 100;
            const k = parseFloat(pinned[theme].brightness);
            for (const palette of ACCENT_PALETTES) {
                for (const backdrop of [palette[theme].primary, opposite, panel]) {
                    const glass = over(panel, tint, backdrop, k);
                    expect(wcagContrast(text, glass), `${palette.id}: text over ${backdrop}`).toBeGreaterThanOrEqual(4.5);
                }
            }
        });
    }
});

describe("accent-fill", () => {
    // The hover lift, the lightest the fill gets.
    const lift = { twilight: 0.2, daylight: 0.12 };
    it("lifts by the amounts this test checks", () => {
        expect(css).toContain("&:hover { --fill-lift: 20%; }");
        expect(token('[data-theme="daylight"] .accent-fill:hover', "fill-lift")).toBe("12%");
    });
    for (const theme of ["twilight", "daylight"] as const) {
        it.each(ACCENT_PALETTES)(`${theme}: on-primary text reads on the lightest stop ($id)`, (palette) => {
            const colours = palette[theme];
            const top = formatHex(interpolate([colours.primary, "white"], "oklab")(lift[theme]));
            expect(wcagContrast(colours.onPrimary, top)).toBeGreaterThanOrEqual(4.5);
        });
    }
});
