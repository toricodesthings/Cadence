import { z } from "zod";
import { insertHabitSchema } from "@cadence/contracts/habit";
import { ROUTINE_SWATCHES } from "../utils/habits";

export const createHabitSchema = insertHabitSchema
    .pick({
        title: true,
        description: true,
        recurrenceRule: true,
        colorAccent: true,
        targetTime: true,
        targetTimes: true,
        times: true,
        emoji: true,
        reminderEnabled: true,
        projectId: true,
        tagIds: true,
        steps: true,
    })
    .extend({
        recurrenceRule: z.string().min(1, "Recurrence is required").max(500),
        colorAccent: z
            .string()
            .refine((value) => ROUTINE_SWATCHES.some((option) => option.value === value), "Pick one of the colours"),
    });
