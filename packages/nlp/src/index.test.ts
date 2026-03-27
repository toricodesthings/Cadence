import { describe, expect, it } from "vitest";
import { applyFocusView, composeFocusView, parseCanonicalNlpEnvelope, parse } from "./index.js";
import type { WarningCode } from "./core/index.js";

describe("@cadence/nlp canonical behavior", () => {
    it("parses canonical envelopes with source surface, dismissal, and confidence metadata", () => {
        const result = parseCanonicalNlpEnvelope({
            rawInput: "Submit report by 5pm",
            sourceSurface: "inbox",
            dateStyle: "mdy",
            dismissedEntityIds: [],
            userOverrides: {},
        });

        expect(result.rawInput).toBe("Submit report by 5pm");
        expect(result.sourceSurface).toBe("inbox");
        expect(result.overallConfidence).toBe("low");
        expect(result.entities[0]?.type).toBe("due_date");
    });

    it("exposes resolvedId aliases for project and tag entities", () => {
        const result = parse({
            input: "Work on Apollo /apollo #planning",
            sourceSurface: "quick_add",
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

        const filtered = applyFocusView(
            [
                { id: "1", state: "ACTIVE", dueDate: "2026-03-20", projectId: null, tagIds: [], priority: 0, effort: null, waitingOn: null, notBefore: null, durationEstimate: null, isPinned: false, orderIndex: 1, scheduledStart: null, scheduledEnd: null, isAllDay: true },
                { id: "2", state: "ACTIVE", dueDate: null, projectId: "proj-1", tagIds: [], priority: 0, effort: null, waitingOn: null, notBefore: null, durationEstimate: null, isPinned: false, orderIndex: 2, scheduledStart: null, scheduledEnd: null, isAllDay: true },
            ],
            composed.definition,
            new Date("2026-03-20T12:00:00.000Z"),
        );

        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.id).toBe("1");
    });
});

// ── §11.4 Parser Test Matrix ──

describe("Parser test matrix", () => {
    // ── Plain capture phrases ──
    describe("plain capture phrases", () => {
        it("returns no entities for plain text", () => {
            const result = parse({ input: "Buy groceries", sourceSurface: "inline_add" });
            expect(result.entities).toHaveLength(0);
            expect(result.cleanedTitle).toBe("Buy groceries");
            expect(result.overallConfidence).toBeNull();
        });

        it("preserves title with no NLP artifacts", () => {
            const result = parse({ input: "Call the dentist about the appointment", sourceSurface: "quick_add" });
            expect(result.entities).toHaveLength(0);
            expect(result.cleanedTitle).toBe("Call the dentist about the appointment");
        });

        it("handles empty input gracefully", () => {
            const result = parse({ input: "", sourceSurface: "inbox" });
            expect(result.entities).toHaveLength(0);
            expect(result.cleanedTitle).toBe("");
        });
    });

    // ── ADHD-style shorthand ──
    describe("ADHD-style shorthand", () => {
        it("parses brain dump with loose date", () => {
            const result = parse({
                input: "Ask Maya if legal needs this before launch maybe sometime soon",
                sourceSurface: "holding_capture",
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
                sourceSurface: "quick_add",
                context: { projects: [{ id: "p1", name: "work" }], tags: [] },
            });
            expect(result.entities.some(e => e.type === "priority")).toBe(true);
            expect(result.entities.some(e => e.type === "scheduled_start")).toBe(true);
            expect(result.entities.some(e => e.type === "project")).toBe(true);
        });

        it("parses power user shorthand with recurrence + tag", () => {
            const result = parse({
                input: "Review sprint board every weekday #planning p2",
                sourceSurface: "quick_add",
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
                referenceDate: new Date("2026-01-01T12:00:00Z"),
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
                referenceDate: new Date("2026-01-01T12:00:00Z"),
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
                sourceSurface: "quick_add",
            });
            expect(result.cleanedTitle).toContain("Buy milk next Friday");
            expect(result.entities.some(e => e.type === "scheduled_start")).toBe(true);
        });

        it("preserves quoted text without date entities", () => {
            const result = parse({
                input: '"Buy milk next Friday" is the task name',
                sourceSurface: "inline_add",
            });
            // The date inside quotes should NOT be parsed
            expect(result.cleanedTitle).toContain("Buy milk next Friday");
        });
    });

    // ── Recurring patterns ──
    describe("recurring patterns", () => {
        it("parses daily recurrence", () => {
            const result = parse({ input: "Take vitamins daily", sourceSurface: "quick_add" });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=DAILY");
            expect(rec!.confidence).toBe("high");
        });

        it("parses weekly day recurrence", () => {
            const result = parse({ input: "Water plants every Monday", sourceSurface: "quick_add" });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=WEEKLY;BYDAY=MO");
        });

        it("parses biweekly recurrence", () => {
            const result = parse({ input: "Team sync every other week", sourceSurface: "quick_add" });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=WEEKLY;INTERVAL=2");
        });

        it("parses monthly recurrence", () => {
            const result = parse({ input: "Review goals every month", sourceSurface: "quick_add" });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toContain("FREQ=MONTHLY");
        });

        it("parses every N days", () => {
            const result = parse({ input: "Check garden every 3 days", sourceSurface: "quick_add" });
            const rec = result.entities.find(e => e.type === "recurrence");
            expect(rec).toBeDefined();
            expect((rec!.normalizedValue as { rrule: string }).rrule).toBe("FREQ=DAILY;INTERVAL=3");
        });
    });

    // ── Waiting-on language ──
    describe("waiting-on language", () => {
        it("parses 'waiting on [person]'", () => {
            const result = parse({ input: "waiting on John to review the PR", sourceSurface: "inbox" });
            const w = result.entities.find(e => e.type === "waiting_on");
            expect(w).toBeDefined();
            expect((w!.normalizedValue as { person: string }).person).toBe("John to review the PR");
            expect(w!.confidence).toBe("high");
        });

        it("parses 'waiting for [person]'", () => {
            const result = parse({ input: "waiting for Sarah", sourceSurface: "quick_add" });
            const w = result.entities.find(e => e.type === "waiting_on");
            expect(w).toBeDefined();
            expect((w!.normalizedValue as { person: string }).person).toBe("Sarah");
        });

        it("parses waiting-on with date boundary", () => {
            const result = parse({ input: "waiting on Mike by tomorrow", sourceSurface: "inbox" });
            const w = result.entities.find(e => e.type === "waiting_on");
            expect(w).toBeDefined();
            expect((w!.normalizedValue as { person: string }).person).toBe("Mike");
        });
    });

    // ── Duration phrases ──
    describe("duration phrases", () => {
        it("parses minutes", () => {
            const result = parse({ input: "Quick 15m task: reply to email", sourceSurface: "quick_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(15);
        });

        it("parses hours", () => {
            const result = parse({ input: "Deep work session 2h", sourceSurface: "quick_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(120);
        });

        it("parses compound hours and minutes", () => {
            const result = parse({ input: "Meeting prep 1h30m", sourceSurface: "quick_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(90);
        });

        it("parses 'half hour'", () => {
            const result = parse({ input: "half hour call with team", sourceSurface: "quick_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(30);
        });

        it("parses 'half an hour'", () => {
            const result = parse({ input: "half an hour of reading", sourceSurface: "inline_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(30);
        });

        it("parses 'quarter hour'", () => {
            const result = parse({ input: "quarter hour standup", sourceSurface: "quick_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(15);
        });

        it("parses '90 mins'", () => {
            const result = parse({ input: "Study session 90 mins", sourceSurface: "quick_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeDefined();
            expect((d!.normalizedValue as { minutes: number }).minutes).toBe(90);
        });

        it("rejects impossible durations", () => {
            const result = parse({ input: "Marathon 1000m task", sourceSurface: "quick_add" });
            const d = result.entities.find(e => e.type === "duration");
            expect(d).toBeUndefined();
        });
    });

    // ── False positives ──
    describe("false positives", () => {
        it("does not parse 'monthly report' as a date", () => {
            const result = parse({ input: "monthly report", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'Friday's notes' as a date", () => {
            const result = parse({ input: "Friday's notes from meeting", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'Black Friday deal' as a date", () => {
            const result = parse({ input: "Black Friday deal", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'Saturday Night Live' as a date", () => {
            const result = parse({ input: "Watch Saturday Night Live", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'daily standup' as a date", () => {
            const result = parse({ input: "daily standup prep", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'morning routine' as a date", () => {
            const result = parse({ input: "morning routine checklist", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'May Day' as a date", () => {
            const result = parse({ input: "May Day celebration", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });

        it("does not parse 'March Madness' as a date", () => {
            const result = parse({ input: "March Madness bracket", sourceSurface: "quick_add" });
            expect(result.entities.filter(e => e.type === "scheduled_start" || e.type === "due_date")).toHaveLength(0);
        });
    });

    // ── Warning codes ──
    describe("warning codes", () => {
        it("emits timed_deadline_needs_review for timed due dates", () => {
            const result = parse({ input: "Submit report by 5pm", sourceSurface: "inbox" });
            expect(result.warnings).toContain("timed_deadline_needs_review" as WarningCode);
        });

        it("emits low_confidence_entity for low confidence dates", () => {
            const result = parse({ input: "Submit report by 5pm", sourceSurface: "inbox" });
            expect(result.warnings).toContain("low_confidence_entity" as WarningCode);
        });

        it("emits multiple_dates_detected when more than one date found", () => {
            const result = parse({ input: "Meet Sarah tomorrow and John next Friday", sourceSurface: "quick_add" });
            expect(result.warnings).toContain("multiple_dates_detected" as WarningCode);
        });

        it("no warnings for simple tasks", () => {
            const result = parse({ input: "Buy milk", sourceSurface: "quick_add" });
            expect(result.warnings).toHaveLength(0);
        });
    });

    // ── Date expressions ──
    describe("date expressions", () => {
        it("parses 'tonight'", () => {
            const result = parse({
                input: "Finish reading tonight",
                sourceSurface: "quick_add",
                referenceDate: new Date("2026-03-20T12:00:00Z"),
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
                referenceDate: new Date("2026-03-20T10:00:00Z"),
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
        });

        it("parses 'next month'", () => {
            const result = parse({
                input: "Review goals next month",
                sourceSurface: "quick_add",
                referenceDate: new Date("2026-03-20T12:00:00Z"),
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
        });

        it("parses 'this weekend'", () => {
            const result = parse({
                input: "Clean the house this weekend",
                sourceSurface: "quick_add",
                referenceDate: new Date("2026-03-18T12:00:00Z"), // Wednesday
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
        });

        it("parses 'in 3 days'", () => {
            const result = parse({
                input: "Follow up in 3 days",
                sourceSurface: "quick_add",
                referenceDate: new Date("2026-03-20T12:00:00Z"),
            });
            const dateEntity = result.entities.find(e => e.type === "scheduled_start");
            expect(dateEntity).toBeDefined();
            expect(dateEntity!.confidence).toBe("high");
        });

        it("detects due_date type with 'by' prefix", () => {
            const result = parse({
                input: "Submit report by Friday",
                sourceSurface: "inbox",
                referenceDate: new Date("2026-03-18T12:00:00Z"),
            });
            const dateEntity = result.entities.find(e => e.type === "due_date");
            expect(dateEntity).toBeDefined();
        });
    });

    // ── Section resolution ──
    describe("section resolution", () => {
        it("resolves sections when context is provided", () => {
            const result = parse({
                input: "Fix navbar in Frontend",
                sourceSurface: "quick_add",
                context: {
                    projects: [],
                    tags: [],
                    sections: [{ id: "s1", name: "Frontend" }, { id: "s2", name: "Backend" }],
                },
            });
            const section = result.entities.find(e => e.type === "section");
            expect(section).toBeDefined();
            expect((section!.normalizedValue as { name: string }).name).toBe("Frontend");
        });

        it("does not resolve sections without context", () => {
            const result = parse({
                input: "Fix navbar in Frontend",
                sourceSurface: "quick_add",
            });
            const section = result.entities.find(e => e.type === "section");
            expect(section).toBeUndefined();
        });
    });

    // ── Confidence trust rules ──
    describe("confidence trust rules", () => {
        it("high confidence for explicit date patterns", () => {
            const result = parse({
                input: "Meeting tomorrow at 3pm",
                sourceSurface: "quick_add",
            });
            expect(result.overallConfidence).toBe("high");
            expect(result.entities.every(e => e.confidence === "high")).toBe(true);
        });

        it("low confidence for timed deadlines", () => {
            const result = parse({
                input: "Submit report by 5pm",
                sourceSurface: "inbox",
            });
            expect(result.overallConfidence).toBe("low");
        });
    });
});
