import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildTasksQuery,
    getTaskSeriesId,
    getTaskRecurrenceSummary,
    getTaskScheduleSummary,
    getTaskTimelineAnchor,
    isRecurringTaskInstance,
} from "../../../../app/lib/utils/task/task-scheduling";
import { formatTime } from "../../../../app/lib/utils/date-format";
import { setUserZone, today } from "../../../../app/lib/utils/user-zone";
import { makeTask } from "../../../helpers";

describe("task scheduling helpers", () => {
    beforeEach(() => setUserZone("America/Toronto"));
    afterEach(() => vi.useRealTimers());

    it("summarizes the four task shapes: unscheduled, day, days, timed", () => {
        expect(getTaskScheduleSummary(makeTask())).toMatchObject({
            kind: "unscheduled",
            displayMode: "none",
            primaryLabel: null,
            anchorDate: null,
        });

        expect(getTaskScheduleSummary(makeTask({ dueDate: "2026-03-09" }))).toMatchObject({
            kind: "day",
            displayMode: "deadline",
            primaryLabel: "Mar 9",
            secondaryLabel: "Deadline",
            anchorDate: "2026-03-09",
        });

        expect(getTaskScheduleSummary(makeTask({ dueDate: "2026-03-09", endDate: "2026-03-12" }))).toMatchObject({
            kind: "days",
            displayMode: "duration",
            primaryLabel: "Mar 9 - Mar 12",
            secondaryLabel: "Duration",
            anchorDate: "2026-03-09",
        });

        expect(
            getTaskScheduleSummary(
                makeTask({
                    scheduledStart: "2026-03-09T13:00:00.000Z",
                    scheduledEnd: "2026-03-09T14:30:00.000Z",
                }),
            ),
        ).toMatchObject({
            kind: "timed",
            displayMode: "timed",
            primaryLabel: "Mar 9, 9:00 AM – 10:30 AM",
            secondaryLabel: "Time block",
            anchorDate: "2026-03-09",
        });
    });

    it("anchors a timed task on the user's day of its start, not the UTC day", () => {
        // 23:30 in Toronto on Mar 9 is already Mar 10 in UTC.
        const task = makeTask({ scheduledStart: "2026-03-10T03:30:00.000Z" });
        expect(getTaskScheduleSummary(task).anchorDate).toBe("2026-03-09");
        setUserZone("Pacific/Kiritimati");
        expect(getTaskScheduleSummary(task).anchorDate).toBe("2026-03-10");
    });

    it("a timed task with a deadline day is still the timed shape", () => {
        expect(
            getTaskScheduleSummary(makeTask({ dueDate: "2026-03-12", scheduledStart: "2026-03-09T13:00:00.000Z" })).kind,
        ).toBe("timed");
    });

    it.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Toronto"])(
        "shows an all-day task due 2026-10-05 on Oct 5 for a user in %s",
        (zone) => {
            // The same instant is Oct 5 in Kiritimati (UTC+14) and still Oct 4 in Pago Pago (UTC-11).
            vi.useFakeTimers().setSystemTime(new Date("2026-10-04T20:00:00.000Z"));
            setUserZone(zone);
            const task = makeTask({ dueDate: "2026-10-05" });

            expect(getTaskScheduleSummary(task)).toMatchObject({ primaryLabel: "Oct 5", anchorDate: "2026-10-05" });
            // Today for this user decides "due today"; the stored day itself never moves.
            expect(getTaskTimelineAnchor(task) === today()).toBe(zone === "Pacific/Kiritimati");
        },
    );

    it("serializes extended task filters for the backend contract", () => {
        expect(
            buildTasksQuery({
                state: "ACTIVE",
                hasNoProject: true,
                hasNoDate: false,
                effectiveOnOrBeforeDate: "2026-03-09",
                range: { from: "2026-03-01", to: "2026-03-31" },
            }),
        ).toEqual({
            state: "ACTIVE",
            from: "2026-03-01",
            to: "2026-03-31",
            hasNoProject: "true",
            hasNoDate: "false",
            effectiveOnOrBeforeDate: "2026-03-09",
        });
    });

    it("formats recurring series metadata without exposing raw RRULE text", () => {
        const task = makeTask({
            scheduledStart: "2026-03-10T13:30:00.000Z",
            scheduledEnd: "2026-03-10T14:45:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502",
        });
        const timeLabel = `${formatTime(task.scheduledStart!)} – ${formatTime(task.scheduledEnd!)}`;

        expect(getTaskRecurrenceSummary(task)).toEqual({
            label: `Repeats Tue & Thu, ${timeLabel}, until May 2`,
            cadenceLabel: "Repeats Tue & Thu",
            detailLabel: `every Tue & Thu, ${timeLabel}, until May 2`,
            weekdayLabel: "Tue & Thu",
            endLabel: "May 2",
        });
    });

    it("says how often an every-N rule repeats", () => {
        const summary = (recurrenceRule: string) => getTaskRecurrenceSummary(makeTask({ recurrenceRule, scheduledStart: null, scheduledEnd: null }))?.cadenceLabel;
        expect(summary("FREQ=DAILY;INTERVAL=3")).toBe("Repeats every 3 days");
        expect(summary("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE")).toBe("Repeats every other week on Mon & Wed");
        expect(summary("FREQ=DAILY")).toBe("Repeats daily");
    });

    it("routes recurring instances back to their series master for mutations", () => {
        const instance = makeTask({
            id: "series-1::2026-03-10",
            seriesId: "series-1",
            isRecurringInstance: true,
        });

        expect(isRecurringTaskInstance(instance)).toBe(true);
        expect(getTaskSeriesId(instance)).toBe("series-1");
    });

    it("labels passive recurring timeblocks as timetable anchors and resolves their occurrence date", () => {
        const passiveSeries = makeTask({
            interactionMode: "timetable",
            zone: "America/Toronto",
            scheduledStart: "2026-03-10T13:30:00.000Z",
            scheduledEnd: "2026-03-10T14:45:00.000Z",
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260502",
        });

        expect(getTaskScheduleSummary(passiveSeries)).toMatchObject({
            kind: "timed",
            secondaryLabel: "Fixed",
        });

        // The next Tuesday/Thursday on or after Wednesday Mar 11 is Thursday Mar 12.
        expect(getTaskTimelineAnchor(passiveSeries, "2026-03-11")).toBe("2026-03-12");
    });

    it("reads the series end from a LocalDate UNTIL", () => {
        const summary = getTaskRecurrenceSummary(makeTask({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231", scheduledStart: null }));
        expect(summary?.endLabel).toBe("Dec 31");
    });
});
