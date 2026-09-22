import { describe, expect, it } from "vitest";
import { formatWhen } from "../../../../../app/components/assistant/widgets/card-lookups";
import { formatShortDateTime } from "../../../../../app/lib/utils/date-format";

describe("formatWhen (proposal card dates)", () => {
    it("shows a date-only proposal on that day in every time zone (regression: showed the day before west of UTC)", () => {
        expect(formatWhen("2026-09-22")).toBe("Sep 22");
    });

    it("shows a timed proposal as its local date and time", () => {
        const at = "2026-09-22T14:00:00-04:00";

        expect(formatWhen(at)).toBe(formatShortDateTime(at));
        expect(formatWhen(at)).toMatch(/, \d/);
    });

    it("returns null for missing or invalid values", () => {
        expect(formatWhen(undefined)).toBeNull();
        expect(formatWhen("not a date")).toBeNull();
    });
});
