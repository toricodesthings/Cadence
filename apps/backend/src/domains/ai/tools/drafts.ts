/**
 * Task schemas for the write tools, derived from the REST contracts so a tool can
 * never offer a field the write path would drop or read differently. `isAllDay`
 * is left out on purpose: it follows from the values (`inferIsAllDay`), so a
 * clock time always means timed.
 */
import { z } from "zod";
import { insertTaskSchema, taskPrioritySchema, updateTaskSchema } from "@cadence/contracts/task";

/** How much of a note the model sees, and the longest note it may rewrite whole. */
export const NOTE_READ_LIMIT = 1_000;

const priority = taskPrioritySchema.describe("0 none, 1 low, 2 medium, 3 high, 4 urgent.");
const step = z.string().min(1).max(500);
const quote = z.string().max(300).optional();

export const taskDraftSchema = insertTaskSchema
    .pick({
        title: true, dueDate: true, scheduledStart: true, scheduledEnd: true, projectId: true, sectionId: true,
        recurrenceRule: true, tagIds: true,
    })
    .extend({
        priority: priority.optional(),
        effort: insertTaskSchema.shape.effort.describe("1 low, 2 medium, 3 high."),
        durationEstimate: insertTaskSchema.shape.durationEstimate.describe("Minutes."),
        subtasks: z.array(step).max(30).optional().describe("Checklist steps, in order."),
        fixed: z.boolean().optional().describe("A class or shift that just passes (timetable)."),
        note: z.string().max(5_000).optional().describe("The new task's note."),
        // Display-only (the card shows it; the write drops it), so an extra key is
        // stripped rather than failing the whole call.
        fromImage: z
            .object({ title: quote, dueDate: quote, scheduledStart: quote, priority: quote, subtasks: quote, note: quote })
            .optional()
            .describe("Field → the exact words the image shows for it."),
    });

export const taskPatchSchema = updateTaskSchema
    .pick({
        title: true, dueDate: true, scheduledStart: true, scheduledEnd: true, projectId: true, sectionId: true,
        waitingOn: true, isPinned: true, recurrenceRule: true,
    })
    .extend({
        priority: priority.optional(),
        effort: updateTaskSchema.shape.effort.describe("1 low, 2 medium, 3 high, null clears."),
        durationEstimate: updateTaskSchema.shape.durationEstimate.describe("Minutes, null clears."),
        addTagIds: z.array(z.uuid()).max(20).optional(),
        removeTagIds: z.array(z.uuid()).max(20).optional(),
        note: z.string().max(5_000).optional().describe(`Replaces the whole note (one task, read whole: ≤${NOTE_READ_LIMIT} characters).`),
        appendNote: z.string().max(5_000).optional().describe("Text added at the end of the note (one task)."),
        noteVersion: z.number().int().min(0).optional().describe("note.version from get_task_detail; required with note."),
    });

export const subtaskEditSchema = z
    .object({
        taskId: z.uuid(),
        add: z.array(step).max(30).optional(),
        update: z
            .array(z.object({ subtaskId: z.uuid(), title: step.optional(), isComplete: z.boolean().optional() }))
            .max(50)
            .optional(),
        remove: z.array(z.object({ subtaskId: z.uuid(), title: z.string().max(500) })).max(50).optional(),
    })
    .refine((v) => v.add?.length || v.update?.length || v.remove?.length, "Nothing to change");
