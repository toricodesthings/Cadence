import { describe, expect, it } from "vitest";
import { applyFocusView, composeFocusView, parseCanonicalNlpEnvelope, parse } from "./index.js";

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
