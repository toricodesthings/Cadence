import { afterEach, describe, expect, it } from "vitest";
import { getDateFormatConfig, setDateFormatConfig } from "../../../../app/lib/utils/date-format";
import { groupFurtherOut } from "../../../../app/lib/utils/task/horizon";

const at = (dueDate: string) => ({ id: dueDate, dueDate });
const initial = { ...getDateFormatConfig() };

describe("groupFurtherOut", () => {
    afterEach(() => setDateFormatConfig(initial));

    it("shows the next four calendar weeks one by one, then months, in date order", () => {
        setDateFormatConfig({ ...initial, weekStartsOn: 1 });
        // Sunday 11 Oct: Further out starts Mon 19 Oct, so weeks run until Mon 16 Nov.
        const groups = groupFurtherOut(
            [at("2026-12-03"), at("2026-10-28"), at("2026-10-20"), at("2026-11-15"), at("2026-11-16"), at("2027-01-05"), at("2026-10-21")],
            "2026-10-11",
        );
        expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
            ["Week of Oct 19", ["2026-10-20", "2026-10-21"]],
            ["Week of Oct 26", ["2026-10-28"]],
            ["Week of Nov 9", ["2026-11-15"]],
            ["Rest of November", ["2026-11-16"]],
            ["December", ["2026-12-03"]],
            ["January 2027", ["2027-01-05"]],
        ]);
    });

    it("follows the user's week start, and a week never splits across the month switch", () => {
        setDateFormatConfig({ ...initial, weekStartsOn: 0 });
        // Sunday-first: Further out's first week is Sun 18 Oct; weeks run until Sun 15 Nov.
        const groups = groupFurtherOut([at("2026-11-14"), at("2026-11-15"), at("2026-11-01")], "2026-10-11");
        expect(groups.map((group) => group.label)).toEqual(["Week of Nov 1", "Week of Nov 8", "Rest of November"]);
    });
});
