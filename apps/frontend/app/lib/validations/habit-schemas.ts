import { z } from "zod";
import { insertHabitSchema } from "@cadence/contracts/habit";

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
        reminderEnabled: true,
        projectId: true,
        tagIds: true,
    })
    .extend({
        recurrenceRule: z.string().min(1, "Recurrence is required").max(500),
        // Product rule: habit cards use a curated accent palette.
        colorAccent: z.enum(["lantern", "glacier", "emerald", "amethyst", "rose", "sage"]),
    });

// z.input keeps defaulted fields optional so the react-hook-form values type
// matches what the form actually submits.
export type CreateHabitValues = z.input<typeof createHabitSchema>;
