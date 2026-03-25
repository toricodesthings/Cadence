import { describe, expect, it } from "vitest";
import {
    getNextPersonalEventDate,
    getPersonalEventMilestoneLabel,
    getNormalizedMonthDay,
    getPersonalEventCountdownLabel,
    sortPersonalEventViewModels,
    toPersonalEventViewModel,
} from "../../../../app/lib/utils/personal-events";

describe("personal event utilities", () => {
    it("clamps invalid month-day values to the nearest valid day for the year", () => {
        expect(getNormalizedMonthDay("02-29", 2025)).toEqual({
            month: 2,
            day: 28,
            monthDay: "02-28",
        });
    });

    it("returns the next occurrence in the current year when the date is still ahead", () => {
        expect(
            getNextPersonalEventDate(
                { monthDay: "11-04" },
                new Date("2026-03-24T00:00:00"),
            ),
        ).toBe("2026-11-04");
    });

    it("rolls over to the next year when the event already passed", () => {
        expect(
            getNextPersonalEventDate(
                { monthDay: "01-10" },
                new Date("2026-03-24T00:00:00"),
            ),
        ).toBe("2027-01-10");
    });

    it("formats countdown labels with friendly near-term wording", () => {
        expect(getPersonalEventCountdownLabel(0)).toBe("Today");
        expect(getPersonalEventCountdownLabel(1)).toBe("Tomorrow");
        expect(getPersonalEventCountdownLabel(12)).toBe("In 12 days");
    });

    it("builds milestone labels from an optional started-on date", () => {
        expect(getPersonalEventMilestoneLabel("2020-03-28", "2026-03-28")).toBe("Marks 6 years");
        expect(getPersonalEventMilestoneLabel("2026-03-28", "2026-03-28")).toBe("Started Mar 28");
        expect(getPersonalEventMilestoneLabel(null, "2026-03-28")).toBeNull();
    });

    it("sorts reminder-enabled events first when requested", () => {
        const today = new Date("2026-03-24T00:00:00");
        const sorted = sortPersonalEventViewModels([
            toPersonalEventViewModel({ id: "a", label: "Later", monthDay: "04-20", emoji: null, notify: false, startedOn: null }, today),
            toPersonalEventViewModel({ id: "b", label: "Soon", monthDay: "03-28", emoji: null, notify: true, startedOn: "2020-03-28" }, today),
        ], "reminders");

        expect(sorted.map((item) => item.event.id)).toEqual(["b", "a"]);
        expect(sorted[0].milestoneLabel).toBe("Marks 6 years");
    });
});
