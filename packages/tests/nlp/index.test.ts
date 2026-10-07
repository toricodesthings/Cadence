import { describe, expect, it } from "vitest";
import { applyFocusView, composeFocusView, FOCUS_VIEW_PRESETS, parseCanonicalNlpEnvelope, parse } from "@cadence/nlp";
import type { NlpClock, WarningCode } from "@cadence/nlp/core";

const clockOf = (today: string): NlpClock => ({ today, now: "12:00", weekStart: "Sunday" });
const CLOCK = clockOf("2026-03-20");

describe("@cadence/nlp canonical behavior", () => {
    it("parses canonical envelopes with source surface, dismissal, and confidence metadata", () => {
        const result = parseCanonicalNlpEnvelope({
            rawInput: "Submit report by 5pm",
            sourceSurface: "inbox",
            dateStyle: "mdy",
            dismissedEntityIds: [],
            userOverrides: {},
        }, { clock: CLOCK });

        expect(result.rawInput).toBe("Submit report by 5pm");
        expect(result.sourceSurface).toBe("inbox");
        expect(result.overallConfidence).toBe("low");
        expect(result.entities[0]?.type).toBe("due_date");
    });

    it("exposes resolvedId aliases for project and tag entities", () => {
        const result = parse({
            input: "Work on Apollo /apollo #planning",
            sourceSurface: "quick_add", clock: CLOCK,
            context: {
                projects: [{ id: "proj-1", name: "Apollo" }],
                tags: [{ id: "tag-1", name: "planning" }],
            },
        });

        const project = result.entities.find((entity) => entity.type === "project");
        const tag = result.entities.find((entity) => entity.type === "tag");

        expect(project?.normalizedValue).toMatchObject({ id: "proj-1", resolvedId: "proj-1" });
        expect(tag?.normalizedValue).toMatchObject({ id: "tag-1", resolvedId: "tag-1" });
    });

    it("composes and applies focus views deterministically", () => {
        const composed = composeFocusView("due today and no project");
        expect(composed.definition.dueWindow).toBe("today");
        expect(composed.definition.needsProject).toBe(true);
        expect(composeFocusView("due today and no list").definition).toEqual(composed.definition);

        const filtered = applyFocusView(
            [
                { id: "1", state: "ACTIVE", dueDate: "2026-03-20", projectId: null, tagIds: [], priority: 0, effort: null, waitingOn: null, notBefore: null, durationEstimate: null, isPinned: false, orderIndex: 1, scheduledStart: null, scheduledEnd: null },
                { id: "2", state: "ACTIVE", dueDate: null, projectId: "proj-1", tagIds: [], priority: 0, effort: null, waitingOn: null, notBefore: null, durationEstimate: null, isPinned: false, orderIndex: 2, scheduledStart: null, scheduledEnd: null },
            ],
            composed.definition,
            { clock: clockOf("2026-03-20"), dayOf: (i) => i.slice(0, 10) },
        );

        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.id).toBe("1");
    });

    // 0.30.0 (B13): short, easy, urgent and demanding are different qualities.
    it("keeps short, easy, urgent and demanding distinct", () => {
        expect(composeFocusView("short tasks").definition.durationMaxMinutes).toBe(30);
        expect(composeFocusView("short tasks").definition.effortMax).toBeNull();
        expect(composeFocusView("easy tasks").definition.effortMax).toBe(1);
        expect(composeFocusView("easy tasks").definition.durationMaxMinutes).toBeNull();
        expect(composeFocusView("urgent tasks").definition.priorityMin).toBe(4);
        expect(composeFocusView("demanding tasks").definition.effortMin).toBe(3);

        const deepFocus = FOCUS_VIEW_PRESETS.find((p) => p.id === "deep-focus");
        expect(deepFocus?.definition.effortMin).toBe(3);
        expect(deepFocus?.definition.priorityMin).toBeNull();

        const tasks = [
            { id: "short-hard", state: "ACTIVE", projectId: null, dueDate: null, scheduledStart: null, priority: 0, effort: 3, durationEstimate: 15 },
            { id: "long-easy", state: "ACTIVE", projectId: null, dueDate: null, scheduledStart: null, priority: 0, effort: 1, durationEstimate: 120 },
            { id: "unestimated", state: "ACTIVE", projectId: null, dueDate: null, scheduledStart: null, priority: 0, effort: null, durationEstimate: null },
        ];
        const ctx = { clock: clockOf("2026-03-20"), dayOf: (i: string) => i.slice(0, 10) };
        expect(applyFocusView(tasks, composeFocusView("short tasks").definition, ctx).map((t) => t.id)).toEqual(["short-hard"]);
        expect(applyFocusView(tasks, composeFocusView("demanding tasks").definition, ctx).map((t) => t.id)).toEqual(["short-hard", "unestimated"]);
    });
});

// ── §11.4 Parser Test Matrix ──

describe("Parser test matrix", () => {
    // ── Plain capture phrases ──
    describe("plain capture phrases", () => {
        it("returns no entities for plain text", () => {
            const result = parse({ input: "Buy groceries", sourceSurface: "inline_add", clock: CLOCK });
            expect(result.entities).toHaveLength(0);
            expect(result.cleanedTitle).toBe("Buy groceries");
            expect(result.overallConfidence).toBeNull();
        });

        it("preserves title with no NLP artifacts", () => {
            const result = parse({ input: "Call the dentist about the appointment", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities).toHaveLength(0);
            expect(result.cleanedTitle).toBe("Call the dentist about the appointment");
        });

        it("handles empty input gracefully", () => {
            const result = parse({ input: "", sourceSurface: "inbox", clock: CLOCK });
            expect(result.entities).toHaveLength(0);
            expect(result.cleanedTitle).toBe("");
        });
    });

    // ── ADHD-style shorthand ──
    describe("ADHD-style shorthand", () => {
        it("treats a standalone !! as Urgent and removes it from the task title", () => {
            const result = parse({ input: "Call the plumber !!", sourceSurface: "holding_capture", clock: CLOCK });
            expect(result.entities.find(e => e.type === "priority")?.normalizedValue).toBe(4);
            expect(result.cleanedTitle).toBe("Call the plumber");
        });

        it.each(["Wonderful!!!", "Remember wow!!", 'Remember "!!"'])
            ("preserves literal punctuation in %s", input => {
                expect(parse({ input, sourceSurface: "holding_capture", clock: CLOCK }).entities
                    .some(e => e.type === "priority")).toBe(false);
            });

        it("parses brain dump with loose date", () => {
            const result = parse({
                input: "Ask Maya if legal needs this before launch maybe sometime soon",
                sourceSurface: "holding_capture", clock: CLOCK,
            });
            // Loose phrasing should produce 0 entities or non-high confidence
            if (result.entities.length > 0) {
                expect(result.overallConfidence).not.toBe("high");
            } else {
                expect(result.overallConfidence).toBeNull();
            }
        });

        it("parses combined shorthand: priority + date + project", () => {
            const result = parse({
                input: "Fix login bug p1 tomorrow /work",
                sourceSurface: "quick_add", clock: CLOCK,
                context: { projects: [{ id: "p1", name: "work" }], tags: [] },
            });
            expect(result.entities.some(e => e.type === "priority")).toBe(true);
            expect(result.entities.some(e => e.type === "scheduled_start")).toBe(true);
            expect(result.entities.some(e => e.type === "project")).toBe(true);
        });

        it("parses power user shorthand with recurrence + tag", () => {
            const result = parse({
                input: "Review sprint board every weekday #planning p2",
                sourceSurface: "quick_add", clock: CLOCK,
                context: { projects: [], tags: [{ id: "t1", name: "planning" }] },
            });
            expect(result.entities.some(e => e.type === "recurrence")).toBe(true);
            expect(result.entities.some(e => e.type === "priority")).toBe(true);
            expect(result.entities.some(e => e.type === "tag")).toBe(true);
        });
    });

    // ── Ambiguous dates by locale ──
    describe("ambiguous dates by locale", () => {
        it("parses MDY style by default", () => {
            const result = parse({
                input: "Meeting 3/5",
                sourceSurface: "inline_add",
                clock: clockOf("2026-01-01"),
                dateStyle: "mdy",
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
            const value = dateEntity!.normalizedValue as { date: string };
            // 3/5 in MDY = March 5
            expect(value.date).toMatch(/2026-03-05/);
        });

        it("parses DMY style when configured", () => {
            const result = parse({
                input: "Meeting 3/5",
                sourceSurface: "inline_add",
                clock: clockOf("2026-01-01"),
                dateStyle: "dmy",
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
            const value = dateEntity!.normalizedValue as { date: string };
            // 3/5 in DMY = May 3
            expect(value.date).toMatch(/2026-05-03/);
        });
    });

    // ── Quoted literals ──
    describe("quoted literals", () => {
        it("protects quoted text from NLP parsing", () => {
            const result = parse({
                input: '"Buy milk next Friday" is done tomorrow',
                sourceSurface: "quick_add", clock: CLOCK,
            });
            expect(result.cleanedTitle).toContain("Buy milk next Friday");
            expect(result.entities.some(e => e.type === "scheduled_start")).toBe(true);
        });

        it("preserves quoted text without date entities", () => {
            const result = parse({
                input: '"Buy milk next Friday" is the task name',
                sourceSurface: "inline_add", clock: CLOCK,
            });
            // The date inside quotes should NOT be parsed
            expect(result.cleanedTitle).toContain("Buy milk next Friday");
        });
    });

    // ── Recurring patterns ──
    describe("recurring patterns", () => {
        it("parses daily recurrence", () => {
            const result = parse({ input: "Take vitamins daily", sourceSurface: "quick_add", clock: CLOCK });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=DAILY");
            expect(rec!.confidence).toBe("high");
        });

        it("parses weekly day recurrence", () => {
            const result = parse({ input: "Water plants every Monday", sourceSurface: "quick_add", clock: CLOCK });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
        });

        it("parses biweekly recurrence", () => {
            const result = parse({ input: "Team sync every other week", sourceSurface: "quick_add", clock: CLOCK });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=WEEKLY;INTERVAL=2");
        });

        it("parses monthly recurrence", () => {
            const result = parse({ input: "Review goals every month", sourceSurface: "quick_add", clock: CLOCK });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toContain("FREQ=MONTHLY");
        });

        it("parses every N days", () => {
            const result = parse({ input: "Check garden every 3 days", sourceSurface: "quick_add", clock: CLOCK });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=DAILY;INTERVAL=3");
        });
    });

    // ── Waiting-on language ──
    describe("waiting-on language", () => {
        it("parses 'waiting on [person]'", () => {
            const result = parse({ input: "waiting on John to review the PR", sourceSurface: "inbox", clock: CLOCK });
            const w = result.entities.find(e => e.type === "waiting_on");
            expect(w).toBeDefined();
            expect((w!.normalizedValue as { person: string }).person).toBe("John to review the PR");
            expect(w!.confidence).toBe("high");
        });

        it("parses 'waiting for [person]'", () => {
            const result = parse({ input: "waiting for Sarah", sourceSurface: "quick_add", clock: CLOCK });
            const w = result.entities.find(e => e.type === "waiting_on");
            expect(w).toBeDefined();
            expect((w!.normalizedValue as { person: string }).person).toBe("Sarah");
        });

        it("parses waiting-on with date boundary", () => {
            const result = parse({ input: "waiting on Mike by tomorrow", sourceSurface: "inbox", clock: CLOCK });
            const w = result.entities.find(e => e.type === "waiting_on");
            expect(w).toBeDefined();
            expect((w!.normalizedValue as { person: string }).person).toBe("Mike");
        });
    });

    // ── Duration phrases ──
    describe("duration phrases", () => {
        it("parses minutes", () => {
            const result = parse({ input: "Quick 15m task: reply to email", sourceSurface: "quick_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(15);
        });

        it("parses hours", () => {
            const result = parse({ input: "Deep work session 2h", sourceSurface: "quick_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(120);
        });

        it("parses compound hours and minutes", () => {
            const result = parse({ input: "Meeting prep 1h30m", sourceSurface: "quick_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(90);
        });

        it("parses 'half hour'", () => {
            const result = parse({ input: "half hour call with team", sourceSurface: "quick_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(30);
        });

        it("parses 'half an hour'", () => {
            const result = parse({ input: "half an hour of reading", sourceSurface: "inline_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(30);
        });

        it("parses 'quarter hour'", () => {
            const result = parse({ input: "quarter hour standup", sourceSurface: "quick_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(15);
        });

        it("parses '90 mins'", () => {
            const result = parse({ input: "Study session 90 mins", sourceSurface: "quick_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(90);
        });

        it("rejects impossible durations", () => {
            const result = parse({ input: "Marathon 1000m task", sourceSurface: "quick_add", clock: CLOCK });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeUndefined();
        });
    });

    // ── False positives ──
    describe("false positives", () => {
        it("does not parse 'monthly report' as a date", () => {
            const result = parse({ input: "monthly report", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'Friday's notes' as a date", () => {
            const result = parse({ input: "Friday's notes from meeting", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'Black Friday deal' as a date", () => {
            const result = parse({ input: "Black Friday deal", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'Saturday Night Live' as a date", () => {
            const result = parse({ input: "Watch Saturday Night Live", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'daily standup' as a date", () => {
            const result = parse({ input: "daily standup prep", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'morning routine' as a date", () => {
            const result = parse({ input: "morning routine checklist", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'May Day' as a date", () => {
            const result = parse({ input: "May Day celebration", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'March Madness' as a date", () => {
            const result = parse({ input: "March Madness bracket", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });
    });

    // ── Warning codes ──
    describe("warning codes", () => {
        it("emits timed_deadline_needs_review for timed due dates", () => {
            const result = parse({ input: "Submit report by 5pm", sourceSurface: "inbox", clock: CLOCK });
            expect(result.warnings).toContain("timed_deadline_needs_review" as WarningCode);
        });

        it("emits low_confidence_entity for low confidence dates", () => {
            const result = parse({ input: "Submit report by 5pm", sourceSurface: "inbox", clock: CLOCK });
            expect(result.warnings).toContain("low_confidence_entity" as WarningCode);
        });

        it("emits multiple_dates_detected when more than one date found", () => {
            const result = parse({ input: "Meet Sarah tomorrow and John next Friday", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.warnings).toContain("multiple_dates_detected" as WarningCode);
        });

        it("no warnings for simple tasks", () => {
            const result = parse({ input: "Buy milk", sourceSurface: "quick_add", clock: CLOCK });
            expect(result.warnings).toHaveLength(0);
        });
    });

    // ── Date expressions ──
    describe("date expressions", () => {
        it("parses 'tonight'", () => {
            const result = parse({
                input: "Finish reading tonight",
                sourceSurface: "quick_add",
                clock: clockOf("2026-03-20"),
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
            // chrono-node recognizes "tonight" as a date reference
            const value = dateEntity!.normalizedValue as { date: string };
            expect(value.date).toMatch(/2026-03-20/);
        });

        it("parses 'this evening'", () => {
            const result = parse({
                input: "Call mom this evening",
                sourceSurface: "quick_add",
                clock: clockOf("2026-03-20"),
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
        });

        it("parses 'next month'", () => {
            const result = parse({
                input: "Review goals next month",
                sourceSurface: "quick_add",
                clock: clockOf("2026-03-20"),
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
        });

        it("parses 'this weekend'", () => {
            const result = parse({
                input: "Clean the house this weekend",
                sourceSurface: "quick_add",
                clock: clockOf("2026-03-18"), // Wednesday
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
        });

        it("parses 'in 3 days'", () => {
            const result = parse({
                input: "Follow up in 3 days",
                sourceSurface: "quick_add",
                clock: clockOf("2026-03-20"),
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
            expect(dateEntity!.confidence).toBe("high");
        });

        it("ends a 'before' deadline the day before, and keeps 'by' inclusive", () => {
            const clock = clockOf("2026-09-23");
            const due = (input: string) =>
                (parse({ input, sourceSurface: "inbox", clock }).entities.find((e) => e.type === "due_date")
                    ?.normalizedValue as { date: string } | undefined)?.date;
            expect(due("Renew passport before March")).toBe("2027-02-28");
            expect(due("Send it before Friday")).toBe("2026-09-24");
            expect(due("Send it by Friday")).toBe("2026-09-25");
            expect(parse({ input: "Renew passport before March", sourceSurface: "inbox", clock }).cleanedTitle).toBe(
                "Renew passport",
            );
        });

        it("detects due_date type with 'by' prefix", () => {
            const result = parse({
                input: "Submit report by Friday",
                sourceSurface: "inbox",
                clock: clockOf("2026-03-18"),
            });
            const dateEntity = result.entities.find(e => e.type === "due_date");
            expect(dateEntity).toBeDefined();
        });
    });

    // ── Confidence trust rules ──
    describe("confidence trust rules", () => {
        it("high confidence for explicit date patterns", () => {
            const result = parse({
                input: "Meeting tomorrow at 3pm",
                sourceSurface: "quick_add", clock: CLOCK,
            });
            expect(result.overallConfidence).toBe("high");
            expect(result.entities.every(e => e.confidence === "high")).toBe(true);
        });

        it("low confidence for timed deadlines", () => {
            const result = parse({
                input: "Submit report by 5pm",
                sourceSurface: "inbox", clock: CLOCK,
            });
            expect(result.overallConfidence).toBe("low");
        });
    });
});

describe("date entity shape (zone-free)", () => {
    const entity = (input: string, today = "2026-03-20", now = "12:00") =>
        parse({ input, sourceSurface: "quick_add", clock: { today, now, weekStart: "Sunday" } }).entities.find(
            (e) => e.type === "scheduled_start" || e.type === "due_date",
        )!;

    it("returns { date, time } and no datetime", () => {
        const v = entity("Call mom tomorrow at 3:30pm").normalizedValue as Record<string, unknown>;
        expect(v).toMatchObject({ date: "2026-03-21", time: "15:30", hasTime: true, humanLabel: "Tomorrow at 3:30 PM" });
        expect("datetime" in v).toBe(false);
    });

    it("date-only has time null", () => {
        expect(entity("Pay rent March 25").normalizedValue).toMatchObject({ date: "2026-03-25", time: null, hasTime: false });
    });

    it("reports a timed deadline with its time", () => {
        const e = entity("Submit report by Saturday 5pm");
        expect(e.type).toBe("due_date");
        expect(e.normalizedValue).toMatchObject({ date: "2026-03-21", time: "17:00", hasTime: true });
    });

    it("works on the clock's day, not the machine's", () => {
        expect(entity("do it today", "2026-12-31", "23:30").normalizedValue).toMatchObject({ date: "2026-12-31" });
        expect(entity("do it tomorrow", "2026-12-31", "23:30").normalizedValue).toMatchObject({ date: "2027-01-01" });
    });
});
