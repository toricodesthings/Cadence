import { describe, expect, it } from "vitest";
import { atLocal } from "@cadence/domain/time";
import { planDay, proposalLabel, type DayPlanInput } from "../../../../app/lib/planning/day-plan";
import { makeTask } from "../../../helpers";
import { setUserZone } from "../../../../app/lib/utils/user-zone";

const zone = "America/Toronto";
setUserZone(zone); // shown in the person's zone, whatever zone this machine is in
const day = "2026-10-20";
const at = (time: string) => atLocal(day, time, zone);
const busyTask = (id: string, start: string, end: string, over: object = {}) => makeTask({ id, scheduledStart: at(start), scheduledEnd: at(end), ...over });

const input = (over: Partial<DayPlanInput> = {}): DayPlanInput => ({
    task: makeTask({ id: "lab", title: "Lab report", durationEstimate: 45 }),
    listName: null, day, zone, now: new Date(atLocal("2026-10-19", "08:00", zone)),
    dayTasks: [], timelineStartHour: 7, evidence: undefined, guess: null, ...over,
});

describe("planDay", () => {
    it("proposes the day's first gap, keeping clear of other blocks and of Done ones", () => {
        const plan = planDay(input({ dayTasks: [busyTask("class", "07:00", "09:00"), busyTask("done", "09:15", "11:00", { state: "COMPLETE" })] }));
        expect(plan.minutes).toBe(45);
        expect(plan.proposals[0].start).toBe(at("09:15")); // a Done block takes no room; the class keeps its 15-minute buffer
    });

    it("never treats a routine as a block", () => {
        const plan = planDay(input({ dayTasks: [busyTask("gym", "07:00", "12:00", { isHabit: true })] }));
        expect(plan.proposals[0].start).toBe(at("07:00"));
        expect(plan.busy).toEqual([]);
    });

    it("orders by what the person said they like, then falls back to earliest", () => {
        const stated = { records: [], stated: [{ buckets: ["evening" as const], about: "lab" }] };
        expect(planDay(input({ evidence: stated })).proposals[0].bucket).toBe("evening");
        expect(planDay(input({ evidence: { records: [], stated: [{ buckets: ["evening" as const], about: "gym" }] } })).proposals[0].start).toBe(at("07:00"));
    });

    it("uses a supported guess for the length, and no gap is an empty list", () => {
        expect(planDay(input({ task: makeTask({ id: "x", title: "Essay" }), guess: { state: "supported", minutes: 30 } })).minutes).toBe(30);
        expect(planDay(input({ task: makeTask({ id: "x", title: "Essay", durationEstimate: 1000 }) })).proposals).toEqual([]);
    });

    it("labels a proposal as a person reads it", () => {
        const [first] = planDay(input()).proposals;
        expect(proposalLabel(first, zone)).toBe("Tue 7 – 7:45am");
    });
});
