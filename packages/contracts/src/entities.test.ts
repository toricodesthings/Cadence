/**
 * The small CRUD contracts (tags, projects, sections, subtasks, inbox, notes)
 * share two promises that every client relies on, so they are checked here as
 * tables rather than once per module:
 *
 * 1. Size limits are part of the API. Changing one is a breaking change.
 * 2. Update schemas carry ONLY the fields that were sent. A default leaking
 *    through `.partial()` would silently overwrite untouched columns.
 */
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { updateHabitSchema } from "./habit";
import {
    insertInboxItemSchema,
    insertInboxSectionSchema,
    processInboxItemSchema,
    updateInboxItemSchema,
    updateInboxSectionSchema,
} from "./inbox";
import { upsertNoteSchema } from "./note";
import { insertProjectSchema, updateProjectSchema } from "./project";
import { createSectionSchema, updateSectionSchema } from "./section";
import { bulkSubtasksSchema, insertSubtaskSchema, subtasksByTaskQuerySchema, updateSubtaskSchema } from "./subtask";
import { insertTagSchema, updateTagSchema } from "./tag";
import { updateTaskSchema } from "./task";

const UUID = "22222222-2222-4222-8222-222222222222";
const ok = (schema: z.ZodType, value: unknown) => schema.safeParse(value).success;

describe("text length limits", () => {
    it.each([
        ["tag name", insertTagSchema, (v: string) => ({ name: v }), 100],
        ["project name", insertProjectSchema, (v: string) => ({ name: v }), 200],
        ["section name", createSectionSchema, (v: string) => ({ name: v, orderIndex: 0 }), 200],
        ["subtask title", insertSubtaskSchema, (v: string) => ({ title: v, orderIndex: 0 }), 500],
        ["inbox item text", insertInboxItemSchema, (v: string) => ({ rawText: v }), 5_000],
        ["inbox section name", insertInboxSectionSchema, (v: string) => ({ name: v }), 200],
        ["inbox process title", processInboxItemSchema, (v: string) => ({ title: v }), 2_000],
    ] as const)("%s must be 1–%i characters", (_label, schema, build, max) => {
        expect(ok(schema, build("x"))).toBe(true);
        expect(ok(schema, build("x".repeat(max)))).toBe(true);
        expect(ok(schema, build(""))).toBe(false);
        expect(ok(schema, build("x".repeat(max + 1)))).toBe(false);
    });

    it("caps a note body at 50k characters, allowing an empty note", () => {
        expect(ok(upsertNoteSchema, { body: "" })).toBe(true);
        expect(ok(upsertNoteSchema, { body: "x".repeat(50_000) })).toBe(true);
        expect(ok(upsertNoteSchema, { body: "x".repeat(50_001) })).toBe(false);
    });
});

describe("update schemas carry only the fields that were sent", () => {
    it.each([
        ["tag", updateTagSchema, { name: "x" }],
        ["project", updateProjectSchema, { name: "x" }],
        ["section", updateSectionSchema, { orderIndex: 3 }],
        ["subtask", updateSubtaskSchema, { isComplete: true }],
        ["inbox item", updateInboxItemSchema, { processed: true }],
        ["inbox section", updateInboxSectionSchema, { name: "x" }],
        ["habit", updateHabitSchema, { archived: true }],
        ["task", updateTaskSchema, { effort: 2 }],
    ] as const)("%s update", (_label, schema, patch) => {
        expect(schema.parse(patch)).toEqual(patch);
    });

    it.each([
        ["tag", updateTagSchema],
        ["project", updateProjectSchema],
        ["section", updateSectionSchema],
        ["subtask", updateSubtaskSchema],
        ["inbox section", updateInboxSectionSchema],
    ] as const)("an empty %s update parses to an empty object", (_label, schema) => {
        expect(schema.parse({})).toEqual({});
    });
});

describe("required fields and nullable clears", () => {
    it("requires an orderIndex to create a section or subtask", () => {
        expect(ok(createSectionSchema, { name: "To Do" })).toBe(false);
        expect(ok(insertSubtaskSchema, { title: "step" })).toBe(false);
    });

    it("lets a project clear its emoji with null", () => {
        expect(updateProjectSchema.parse({ emoji: null })).toEqual({ emoji: null });
    });

    it("lets an inbox item move out of its section with null", () => {
        expect(updateInboxItemSchema.parse({ sectionId: null })).toEqual({ sectionId: null });
    });

    it("scopes a section to a project or to none", () => {
        expect(ok(createSectionSchema, { name: "a", orderIndex: 0, projectId: UUID })).toBe(true);
        expect(ok(createSectionSchema, { name: "a", orderIndex: 0, projectId: null })).toBe(true);
        expect(ok(createSectionSchema, { name: "a", orderIndex: 0, projectId: "nope" })).toBe(false);
    });
});

describe("bulkSubtasksSchema", () => {
    it("accepts up to 200 task ids and rejects more or malformed ones", () => {
        expect(ok(bulkSubtasksSchema, { taskIds: [] })).toBe(true);
        expect(ok(bulkSubtasksSchema, { taskIds: Array(200).fill(UUID) })).toBe(true);
        expect(ok(bulkSubtasksSchema, { taskIds: Array(201).fill(UUID) })).toBe(false);
        expect(ok(bulkSubtasksSchema, { taskIds: ["not-a-uuid"] })).toBe(false);
    });
});

describe("subtasksByTaskQuerySchema", () => {
    it("reads comma-separated ids with the same 200 cap", () => {
        expect(subtasksByTaskQuerySchema.parse({ taskIds: `${UUID},${UUID}` })).toEqual({ taskIds: [UUID, UUID] });
        expect(ok(subtasksByTaskQuerySchema, { taskIds: Array(200).fill(UUID).join(",") })).toBe(true);
        expect(ok(subtasksByTaskQuerySchema, { taskIds: Array(201).fill(UUID).join(",") })).toBe(false);
        expect(ok(subtasksByTaskQuerySchema, { taskIds: "not-a-uuid" })).toBe(false);
    });
});
