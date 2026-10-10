/**
 * Task schemas for the write tools, derived from the REST contracts so a tool can
 * never offer a field the write path would drop or read differently. All-day is
 * derived (no `scheduledStart`). A deadline is a day (`dueDate`, YYYY-MM-DD, a time in it
 * is rejected); a time means a timed block (`scheduledStart` instant with offset) or a reminder.
 */
import { z } from "zod";
import { insertTagSchema } from "@cadence/contracts/tag";
import { insertTaskSchema, taskPrioritySchema, updateTaskSchema } from "@cadence/contracts/task";

/** How much of a note the model sees, and the longest note it may rewrite whole. */
export const NOTE_READ_LIMIT = 1_000;

const priority = taskPrioritySchema.describe("0 none, 1 low, 2 medium, 3 high, 4 urgent.");
const step = z.string().min(1).max(500);
const quote = z.string().max(300).optional();
const tagNames = z.array(insertTagSchema.shape.name).max(20);
const reminderAt = insertTaskSchema.shape.reminderAt.describe("When to remind the user: local time with offset.");
const dayError = "A deadline is a day: use YYYY-MM-DD with no time. For a time of day, set reminderAt, or plan a timed block with scheduledStart and scheduledEnd (with offset).";
const instantError = "A time block's start and end are a time with an offset, e.g. 2026-09-22T14:00:00-04:00. For an all-day task use dueDate (YYYY-MM-DD).";
const dueDate = z.iso.date({ error: dayError }).nullable().optional();
const instant = () => z.iso.datetime({ offset: true, error: instantError }).nullable().optional();
const hideUntil = z.iso.date().describe("Hide it from lists until this local day.");
const when = {
    dueDate: dueDate.describe("The day it sits on, or its deadline, YYYY-MM-DD (never a time); null clears."),
    scheduledStart: instant().describe("A time block's start, with offset; omit for an all-day task; null clears."),
    scheduledEnd: instant().describe("The time block's end, with offset."),
    recurrenceRule: insertTaskSchema.shape.recurrenceRule.describe(
        "Repeats, as an RRULE, e.g. FREQ=WEEKLY;BYDAY=MO,WE; null stops it. Things done for their own sake are routines (create_habit).",
    ),
};

export const taskDraftSchema = insertTaskSchema
    .pick({
        title: true, dueDate: true, scheduledStart: true, scheduledEnd: true, projectId: true, sectionId: true,
        recurrenceRule: true, tagIds: true,
    })
    .extend({
        ...when,
        priority: priority.optional(),
        effort: insertTaskSchema.shape.effort.describe("1 low, 2 medium, 3 high."),
        durationEstimate: insertTaskSchema.shape.durationEstimate.describe("Minutes."),
        subtasks: z.array(step).max(30).optional().describe("Checklist steps, in order."),
        fixed: z.boolean().optional().describe("A class or shift that just passes (timetable)."),
        note: z.string().max(5_000).optional().describe("The new task's note."),
        tagNames: tagNames.optional().describe("Tags by name: an existing tag matches, a new name makes one."),
        reminderAt: reminderAt.optional(),
        hideUntil: hideUntil.optional(),
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
        ...when,
        priority: priority.optional(),
        effort: updateTaskSchema.shape.effort.describe("1 low, 2 medium, 3 high, null clears."),
        durationEstimate: updateTaskSchema.shape.durationEstimate.describe("Minutes, null clears."),
        addTagIds: z.array(z.uuid()).max(20).optional(),
        removeTagIds: z.array(z.uuid()).max(20).optional(),
        addTagNames: tagNames.optional().describe("Tags to add by name: an existing tag matches, a new name makes one."),
        removeTagNames: tagNames.optional().describe("Tags to take off, by name."),
        reminderAt: reminderAt.nullable().optional().describe("When to remind the user: local time with offset; null removes it."),
        checkInAt: updateTaskSchema.shape.waitingReminder.describe("A Waiting task's check-in: local time with offset; null removes it."),
        hideUntil: hideUntil.nullable().optional().describe("Hide it from lists until this local day; null shows it again."),
        fixed: z.boolean().optional().describe("true makes it a Fixed block (class, shift); false a normal task."),
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
        order: z.array(z.uuid()).max(50).optional().describe("Existing step ids in their new order; steps left out follow, as they were."),
    })
    .refine((v) => v.add?.length || v.update?.length || v.remove?.length || v.order?.length, "Nothing to change");
