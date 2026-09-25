import { z } from "zod";
import { insertHabitSchema } from "@cadence/contracts/habit";
import { ROUTINE_SWATCHES } from "../utils/habits";

// Form schema is a DERIVATION of the canonical backend `insertHabitSchema`
// (one source of truth) — not a parallel definition. Only form-only ergonomics
// (restricted colour palette, friendly messages) are layered on top.
export const createHabitSchema = insertHabitSchema
    .pick({
        title: true,
        description: true,
        recurrenceRule: true,
        colorAccent: true,
        targetTime: true,
        targetTimes: true,
        emoji: true,
        reminderEnabled: true,
        projectId: true,
        tagIds: true,
        steps: true,
    })
    .extend({
        recurrenceRule: z.string().min(1, "Recurrence is required").max(500),
        // Product rule: routines use the list palette (or the default tint).
        colorAccent: z.string().refine((value) => ROUTINE_SWATCHES.some((option) => option.value === value), "Pick one of the colours"),
    });

// z.input keeps defaulted fields optional so the form values type
// matches what the form actually submits.
export type CreateHabitValues = z.input<typeof createHabitSchema>;
