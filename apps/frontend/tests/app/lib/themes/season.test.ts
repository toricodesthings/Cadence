import { describe, expect, it } from "vitest";
import { resolveLoadingSeason } from "../../../../app/lib/themes/season";

describe("resolveLoadingSeason", () => {
    it("uses the user's pick", () => {
        expect(resolveLoadingSeason("winter")).toBe("winter");
    });

    it("follows the date on auto, and ignores theme preset ids", () => {
        const byDate = resolveLoadingSeason("auto");
        expect(resolveLoadingSeason(undefined)).toBe(byDate);
        expect(resolveLoadingSeason("spring-bloom")).toBe(byDate);
    });
});
