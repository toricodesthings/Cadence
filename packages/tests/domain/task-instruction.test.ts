import { describe, expect, it } from "vitest";
import { parse } from "@cadence/nlp";
import { resolveDraft, type DraftField } from "@cadence/domain/nlp-draft";
import { findSectionMention, instructionPatch, isEmptyPatch, resolveSection, undoPatch } from "@cadence/domain/task-instruction";

const CLOCK = { today: "2026-10-06", now: "10:00", weekStart: "Sunday" as const }; // a Tuesday
const CAPS = new Set<DraftField>(["dueDate", "scheduledStart", "scheduledEnd", "durationMinutes", "projectId", "tagIds", "waitingOn", "priority"]);
const context = { projects: [{ id: "p-work", name: "Work" }], tags: [{ id: "t-err", name: "errands" }] };
const run = (text: string) => {
    const r = parse({ input: text, sourceSurface: "inline_add", clock: CLOCK, context });
    return instructionPatch(text, resolveDraft(text, r.entities, {}, { zone: "America/Toronto", capabilities: CAPS }), "America/Toronto");
};

describe("instructionPatch", () => {
    it("moves to a day", () => {
        expect(run("move these to next Monday").patch).toMatchObject({ dueDate: "2026-10-12", scheduledStart: null });
    });
    it("places a timed block with an estimate", () => {
        const { patch } = run("Friday 3pm for 30 minutes");
        expect(patch.scheduledStart).toBeTruthy();
        expect(patch.durationEstimate).toBe(30);
        expect(patch.dueDate).toBeNull();
    });
    it("keeps waiting until a day without making it a deadline", () => {
        expect(run("keep waiting until Monday").patch).toEqual({ state: "WAITING", notBefore: "2026-10-12" });
    });
    it("follows up without changing state or day", () => {
        const { patch } = run("follow up next Tuesday");
        expect(patch.waitingReminder).toBeTruthy();
        expect(patch.state).toBeUndefined();
        expect(patch.dueDate).toBeUndefined();
    });
    it("activates for tomorrow", () => {
        expect(run("activate tomorrow").patch).toMatchObject({ state: "ACTIVE", dueDate: "2026-10-07" });
    });
    it("clears the day on keep unscheduled", () => {
        expect(run("keep unscheduled").patch).toEqual({ dueDate: null, scheduledStart: null, scheduledEnd: null });
    });
    it("puts in a list, tags, and reports what it could not read", () => {
        const r = run("put these in Work / Admin tag it errands");
        expect(r.patch).toMatchObject({ projectId: "p-work", addTagIds: ["t-err"] });
        expect(r.unread).toBe("Admin");
    });
    it("reads nothing from nonsense", () => {
        const r = run("sort of soon");
        expect(isEmptyPatch(r.patch)).toBe(true);
        expect(r.unread).toBe("sort of soon");
    });
});

describe("undoPatch", () => {
    it("restores only fields still holding what the patch wrote", () => {
        const patch = { dueDate: "2026-10-12", projectId: "p-work" };
        const restore = undoPatch(patch, { dueDate: "2026-10-08", projectId: null }, { dueDate: "2026-10-12", projectId: "p-other" });
        expect(restore).toEqual({ dueDate: "2026-10-08" });
    });
});

describe("sections in instructions", () => {
    const SECTIONS = [
        { id: "s-later", name: "Later This Week", projectId: "p-work" },
        { id: "s-next", name: "Next", projectId: "p-work" },
        { id: "s-next-home", name: "Next", projectId: "p-home" },
    ];
    const withSection = (text: string) => {
        const mention = findSectionMention(text, SECTIONS);
        const masked = mention ? text.slice(0, mention.start) + " ".repeat(mention.end - mention.start) + text.slice(mention.end) : text;
        const r = parse({ input: masked, sourceSurface: "inline_add", clock: CLOCK, context });
        const draft = resolveDraft(masked, r.entities, {}, { zone: "America/Toronto", capabilities: CAPS });
        return instructionPatch(masked, draft, "America/Toronto", resolveSection(mention, draft.fields.projectId));
    };

    it("puts work in a named section and its list, without reading the name as a date", () => {
        expect(withSection("put in Later This Week").patch).toEqual({ projectId: "p-work", sectionId: "s-later" });
    });
    it("a name in two lists needs the list named too", () => {
        expect(withSection("move to Next").patch).toEqual({});
        expect(withSection("move to the Next section in Work").patch).toEqual({ projectId: "p-work", sectionId: "s-next" });
    });
    it("a section named like a day needs the word section, so 'to today' stays a date", () => {
        const today = [{ id: "s-today", name: "Today", projectId: "p-work" }];
        const isDay = (name: string) => /^today$/i.test(name);
        expect(findSectionMention("move these to today", today, isDay)).toBeNull();
        expect(findSectionMention("move to the Today section", today, isDay)?.candidates).toEqual(today);
    });
    it("needs a placement cue: a section name inside other words is not a move", () => {
        expect(findSectionMention("Next Monday", SECTIONS)).toBeNull();
    });
});
