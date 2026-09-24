import { expectTypeOf, test } from "vitest";
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
    aiImages,
} from "../../src/db/schema";
import type { taskRowSchema } from "@cadence/contracts/task";
import type { projectRowSchema } from "@cadence/contracts/project";
import type { tagRowSchema } from "@cadence/contracts/tag";
import type { inboxItemRowSchema, inboxSectionRowSchema } from "@cadence/contracts/inbox";
import type { habitRowSchema } from "@cadence/contracts/habit";
import type { subtaskRowSchema } from "@cadence/contracts/subtask";
import type { taskSectionRowSchema } from "@cadence/contracts/section";
import type { taskNoteRowSchema } from "@cadence/contracts/note";
import type { aiConversationRowSchema, aiImageRowSchema, aiMessageRowSchema } from "@cadence/contracts/ai";

// Compile-time guardrails, enforced by `tsc --noEmit` (vitest itself cannot fail
// them): every contract Row schema must be structurally identical to its Drizzle
// `$inferSelect` row. A column rename/add/nullability change fails typecheck on
// the exact line below instead of silently breaking a client. This is the only
// legitimate place a test depends on Drizzle.

test("every contract row schema matches its Drizzle table", () => {
    expectTypeOf<z.infer<typeof taskRowSchema>>().toEqualTypeOf<typeof tasks.$inferSelect>();
    expectTypeOf<z.infer<typeof projectRowSchema>>().toEqualTypeOf<typeof projects.$inferSelect>();
    expectTypeOf<z.infer<typeof tagRowSchema>>().toEqualTypeOf<typeof tags.$inferSelect>();
    expectTypeOf<z.infer<typeof inboxItemRowSchema>>().toEqualTypeOf<typeof inboxItems.$inferSelect>();
    expectTypeOf<z.infer<typeof inboxSectionRowSchema>>().toEqualTypeOf<typeof inboxSections.$inferSelect>();
    expectTypeOf<z.infer<typeof habitRowSchema>>().toEqualTypeOf<typeof habits.$inferSelect>();
    expectTypeOf<z.infer<typeof subtaskRowSchema>>().toEqualTypeOf<typeof subtasks.$inferSelect>();
    expectTypeOf<z.infer<typeof taskSectionRowSchema>>().toEqualTypeOf<typeof taskSections.$inferSelect>();
    expectTypeOf<z.infer<typeof taskNoteRowSchema>>().toEqualTypeOf<typeof taskNotes.$inferSelect>();
    expectTypeOf<z.infer<typeof aiConversationRowSchema>>().toEqualTypeOf<typeof aiConversations.$inferSelect>();
    expectTypeOf<z.infer<typeof aiMessageRowSchema>>().toEqualTypeOf<typeof aiMessages.$inferSelect>();
    expectTypeOf<z.infer<typeof aiImageRowSchema>>().toEqualTypeOf<typeof aiImages.$inferSelect>();
});
