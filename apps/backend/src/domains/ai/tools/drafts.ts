/**
 * Task draft schemas for the propose_* tools, derived from the REST contracts so a
 * tool can never offer a field the write path would drop or read differently.
 * `isAllDay` is left out on purpose: the card infers it from the values
 * (`inferIsAllDay`), so a clock time always means timed.
 */
import { z } from "zod";
import { insertTaskSchema, taskPrioritySchema, updateTaskSchema } from "@cadence/contracts/task";

/** How much of a note the model sees, and the longest note it may rewrite whole. */
export const NOTE_READ_LIMIT = 1_000;

const note = z.string().max(5_000).describe("The note's full text.");
const priority = taskPrioritySchema.describe("0 none, 1 low, 2 medium, 3 high, 4 urgent.");
const effort = insertTaskSchema.shape.effort.describe("1 low, 2 medium, 3 high.");

export const taskDraftSchema = insertTaskSchema
    .pick({ title: true, dueDate: true, scheduledStart: true, scheduledEnd: true, durationEstimate: true, projectId: true, tagIds: true })
    .extend({
        priority: priority.optional(),
        effort,
        durationEstimate: insertTaskSchema.shape.durationEstimate.describe("Minutes."),
        note: note.optional(),
    });

export const taskPatchSchema = updateTaskSchema
    .pick({ title: true, state: true, dueDate: true, scheduledStart: true, scheduledEnd: true, projectId: true, waitingOn: true })
    .extend({
        taskId: z.uuid(),
        priority: priority.optional(),
        effort: updateTaskSchema.shape.effort.describe("1 low, 2 medium, 3 high, null clears."),
        durationEstimate: updateTaskSchema.shape.durationEstimate.describe("Minutes, null clears."),
        tagIds: z.array(z.uuid()).max(20).optional().describe("The FULL tag set after the change. [] removes all."),
        note: note.optional().describe(`Replaces the whole note. Only for notes you read whole (≤${NOTE_READ_LIMIT} characters).`),
        appendNote: z.string().max(5_000).optional().describe("Text added at the end of the note."),
        noteVersion: z.number().int().min(0).optional().describe("note.version from get_task_detail; required with note or appendNote."),
    });
