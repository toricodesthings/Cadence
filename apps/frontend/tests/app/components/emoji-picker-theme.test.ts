import { describe, expect, it } from "vitest";
import { toTriplet } from "../../../app/components/shared/EmojiPicker";

describe("emoji picker theme", () => {
    it("reads rgb() and color-mix's color(srgb …) into the r, g, b triplet emoji-mart takes", () => {
        expect(toTriplet("rgb(12, 34, 56)")).toBe("12, 34, 56");
        expect(toTriplet("rgba(12, 34, 56, 0.5)")).toBe("12, 34, 56");
        expect(toTriplet("color(srgb 0.1 0.5 1)")).toBe("26, 128, 255");
    });
});
