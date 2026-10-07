import { describe, expect, it } from "vitest";
import { parse } from "@cadence/nlp";
import { resolveDraft, type DraftDecisions, type DraftField } from "@cadence/domain/nlp-draft";

const CLOCK = { today: "2026-10-06", now: "10:00", weekStart: "Sunday" as const };
const ALL = new Set<DraftField>([
    "dueDate", "scheduledStart", "scheduledEnd", "recurrenceRule", "priority", "projectId", "tagIds", "waitingOn", "durationMinutes",
]);
const context = {
    projects: [{ id: "p-work", name: "Work" }],
    tags: [{ id: "t-err", name: "errands" }, { id: "t-exp", name: "Expecting" }],
};
const draft = (input: string, decisions: DraftDecisions = {}, caps: ReadonlySet<DraftField> = ALL) => {
    const r = parse({ input, sourceSurface: "inline_add", clock: CLOCK, context });
    return resolveDraft(input, r.entities, decisions, { zone: "America/Toronto", capabilities: caps });
};

describe("resolveDraft", () => {
    it("counts a relative reminder back from the timed start, wherever it sits in the sentence", () => {
        const caps = new Set<DraftField>([...ALL, "reminderAt"]);
        const d = draft("Dentist tomorrow at 3pm remind me 30 minutes before", {}, caps);
        expect(d.fields).toMatchObject({ scheduledStart: "2026-10-07T19:00:00.000Z", reminderAt: "2026-10-07T18:30:00.000Z", durationMinutes: null });
        expect(d.title).toBe("Dentist");
        expect(draft("Remind me an hour before, call Jo tomorrow at 3pm", {}, caps).fields.reminderAt).toBe("2026-10-07T18:00:00.000Z");
    });

    it("a relative reminder with no start sets nothing and keeps its words", () => {
        const d = draft("Dentist tomorrow remind me 30 minutes before", {}, new Set<DraftField>([...ALL, "reminderAt"]));
        expect(d.fields.reminderAt).toBeNull();
        expect(d.fields.durationMinutes).toBeNull();
        expect(d.title).toBe("Dentist remind me 30 minutes before");
    });

    it("applies clear language and cleans only that phrase", () => {
        const d = draft("Call Sam tomorrow p2");
        expect(d.fields).toMatchObject({ dueDate: "2026-10-07", priority: 3 });
        expect(d.title).toBe("Call Sam");
    });

    it("offers a flexible window without applying it or touching the title", () => {
        const d = draft("do this thing in the next 2 days");
        expect(d.fields.dueDate).toBeNull();
        expect(d.title).toBe("do this thing in the next 2 days");
        expect(d.suggestions).toHaveLength(1);
    });

    it("accepting the suggestion sets the day and cleans its phrase", () => {
        const first = draft("do this thing in the next 2 days");
        const d = draft("do this thing in the next 2 days", { accepted: [first.suggestions[0].id] });
        expect(d.fields.dueDate).toBe("2026-10-08");
        expect(d.title).toBe("do this thing");
    });

    it("dismissing keeps the words and sets nothing", () => {
        const d = draft("Call Sam tomorrow", { dismissed: ["scheduled_start:tomorrow"] });
        expect(d.fields.dueDate).toBeNull();
        expect(d.title).toBe("Call Sam tomorrow");
    });

    it("a hand-set date replaces the phrase; clearing it restores the words", () => {
        expect(draft("Call Sam tomorrow", { manual: { dueDate: "2026-10-09" } })).toMatchObject({
            fields: { dueDate: "2026-10-09" },
            title: "Call Sam",
        });
        expect(draft("Call Sam tomorrow", { manual: { dueDate: null } })).toMatchObject({
            fields: { dueDate: null },
            title: "Call Sam tomorrow",
        });
    });

    it("gives a timed range an exact end, across midnight too", () => {
        const d = draft("Email Alex tomorrow 2pm to 3pm");
        expect(d.fields.scheduledStart).toBe("2026-10-07T18:00:00.000Z");
        expect(d.fields.scheduledEnd).toBe("2026-10-07T19:00:00.000Z");
    });

    it("keeps keep-as-written literal but honours manual fields", () => {
        const d = draft("Call Sam tomorrow", { literal: true, manual: { priority: 2 } });
        expect(d.title).toBe("Call Sam tomorrow");
        expect(d.fields).toMatchObject({ dueDate: null, priority: 2 });
    });

    it("leaves fields the surface cannot store in the title", () => {
        const d = draft("Stretch tomorrow every weekday", {}, new Set<DraftField>(["dueDate"]));
        expect(d.fields.recurrenceRule).toBeNull();
        expect(d.title).toBe("Stretch every weekday");
    });

    it("uses a cued list and tag, and never a bare word", () => {
        expect(draft("Plan budget in Work tag it errands").fields).toMatchObject({ projectId: "p-work", tagIds: ["t-err"] });
        expect(draft("Expecting guests").fields.tagIds).toEqual([]);
    });

    it("saves a timed block and a deadline independently", () => {
        const d = draft("Work on report tomorrow at 2pm, due Friday");
        expect(d.fields.scheduledStart).not.toBeNull();
        expect(d.fields.dueDate).toBe("2026-10-09");
    });
});

describe("routine and yearly-event capabilities", () => {
    const routine = new Set<DraftField>(["recurrenceRule", "timeOfDay", "projectId", "tagIds"]);
    it("keeps a routine's cadence and wall time, not a day", () => {
        const d = draft("Stretch every weekday at 7am", {}, routine);
        expect(d.fields).toMatchObject({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", timeOfDay: "07:00" });
        expect(d.title).toBe("Stretch");
    });
    it("leaves a routine phrase with a day in its title", () => {
        const d = draft("Stretch tomorrow at 7am", {}, routine);
        expect(d.fields.timeOfDay).toBeNull();
        expect(d.title).toBe("Stretch tomorrow at 7am");
    });
    it("a yearly event takes only a month and day", () => {
        const d = draft("Mom's birthday May 12", {}, new Set<DraftField>(["dueDate"]));
        expect(d.fields.dueDate).toMatch(/-05-12$/);
        expect(d.title).toBe("Mom's birthday");
    });
});
