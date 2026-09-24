import { describe, expect, it } from "vitest";
import { sanitizeBackgroundPatch } from "../../src/domains/settings/background-image";

describe("sanitizeBackgroundPatch", () => {
    const image = {
        id: "22222222-2222-4222-8222-222222222222",
        dominant: "#223344",
        swatches: ["#aa5500"],
        accent: null,
        blur: 0,
        brightness: 80,
    };
    const withImage = { appearance: { backgroundImage: image } };
    const withoutImage = { appearance: { backgroundImage: null } };

    it("lets a patch adjust accent, blur and brightness only", () => {
        const patch = {
            appearance: {
                backgroundImage: { id: "33333333-3333-4333-8333-333333333333", swatches: ["#000000"], accent: "#aa5500", blur: 40, brightness: 60 },
            },
        };
        expect(sanitizeBackgroundPatch(withImage, patch)).toEqual({
            appearance: { backgroundImage: { accent: "#aa5500", blur: 40, brightness: 60 } },
        });
    });

    it("never lets a patch clear the photo", () => {
        expect(sanitizeBackgroundPatch(withImage, { appearance: { backgroundImage: null } })).toEqual({ appearance: {} });
    });

    it("drops photo fields and image mode when there is no photo", () => {
        expect(
            sanitizeBackgroundPatch(withoutImage, { appearance: { backgroundMode: "image", backgroundImage: { blur: 10 }, palette: "rose" } }),
        ).toEqual({ appearance: { palette: "rose" } });
    });

    it("leaves patches without appearance alone", () => {
        const patch = { tasks: { hideCompleted: true } };
        expect(sanitizeBackgroundPatch(withImage, patch)).toBe(patch);
    });
});
