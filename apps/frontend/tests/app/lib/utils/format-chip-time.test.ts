import { beforeEach, describe, expect, it } from "vitest";
import { formatChipTime, setDateFormatConfig } from "../../../../app/lib/utils/date-format";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const t = (hm: string) => `2026-10-12T${hm}:00-04:00`;

describe("formatChipTime", () => {
    beforeEach(() => setUserZone("America/Toronto"));

    it("12h shows the meridiem once, twice when it changes, and drops :00", () => {
        setDateFormatConfig({ timeDisplay: "12h", dateStyle: "mdy", weekStartsOn: 1 });
        expect(formatChipTime(t("08:35"), t("09:55"))).toBe("8:35 – 9:55am");
        expect(formatChipTime(t("11:35"), t("12:55"))).toBe("11:35am – 12:55pm");
        expect(formatChipTime(t("11:00"))).toBe("11am");
    });

    it("24h pads and keeps minutes", () => {
        setDateFormatConfig({ timeDisplay: "24h", dateStyle: "mdy", weekStartsOn: 1 });
        expect(formatChipTime(t("08:35"), t("09:55"))).toBe("08:35 – 09:55");
        expect(formatChipTime(t("11:00"))).toBe("11:00");
    });
});
