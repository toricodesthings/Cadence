import { test } from "vitest";
import { expectTypeOf } from "vitest";
import type { z } from "zod";
import {
    tasks,
    projects,
    tags,
    inboxItems,
    inboxSections,
    habits,
    subtasks,
    taskSections,
    taskNotes,
    aiConversations,
    aiMessages,
} from "../../src/db/schema";
import type { taskRowSchema } from "@cadence/contracts/task";
import type { projectRowSchema } from "@cadence/contracts/project";
import type { tagRowSchema } from "@cadence/contracts/tag";
import type { inboxItemRowSchema, inboxSectionRowSchema } from "@cadence/contracts/inbox";
import type { habitRowSchema } from "@cadence/contracts/habit";
import type { subtaskRowSchema } from "@cadence/contracts/subtask";
import type { taskSectionRowSchema } from "@cadence/contracts/section";
import type { taskNoteRowSchema } from "@cadence/contracts/note";
import type { aiConversationRowSchema, aiMessageRowSchema } from "@cadence/contracts/ai";

// These are compile-time guardrails (enforced by `tsc --noEmit`): every contract
// Row schema must be structurally identical to its Drizzle `$inferSelect` row.
// A column rename/add/nullability change now fails typecheck here instead of
// silently breaking a client. This is the only legitimate place a test depends
// on Drizzle.

test("task row contract matches DB", () => {
    expectTypeOf<z.infer<typeof taskRowSchema>>().toEqualTypeOf<typeof tasks.$inferSelect>();
});

test("project row contract matches DB", () => {
    expectTypeOf<z.infer<typeof projectRowSchema>>().toEqualTypeOf<typeof projects.$inferSelect>();
});

test("tag row contract matches DB", () => {
    expectTypeOf<z.infer<typeof tagRowSchema>>().toEqualTypeOf<typeof tags.$inferSelect>();
});

test("inbox item row contract matches DB", () => {
    expectTypeOf<z.infer<typeof inboxItemRowSchema>>().toEqualTypeOf<typeof inboxItems.$inferSelect>();
});

test("inbox section row contract matches DB", () => {
    expectTypeOf<z.infer<typeof inboxSectionRowSchema>>().toEqualTypeOf<typeof inboxSections.$inferSelect>();
});

test("habit row contract matches DB", () => {
    expectTypeOf<z.infer<typeof habitRowSchema>>().toEqualTypeOf<typeof habits.$inferSelect>();
});

test("subtask row contract matches DB", () => {
    expectTypeOf<z.infer<typeof subtaskRowSchema>>().toEqualTypeOf<typeof subtasks.$inferSelect>();
});

test("task section row contract matches DB", () => {
    expectTypeOf<z.infer<typeof taskSectionRowSchema>>().toEqualTypeOf<typeof taskSections.$inferSelect>();
});

test("task note row contract matches DB", () => {
    expectTypeOf<z.infer<typeof taskNoteRowSchema>>().toEqualTypeOf<typeof taskNotes.$inferSelect>();
});

test("ai conversation row contract matches DB", () => {
    expectTypeOf<z.infer<typeof aiConversationRowSchema>>().toEqualTypeOf<typeof aiConversations.$inferSelect>();
});

test("ai message row contract matches DB", () => {
    expectTypeOf<z.infer<typeof aiMessageRowSchema>>().toEqualTypeOf<typeof aiMessages.$inferSelect>();
});
