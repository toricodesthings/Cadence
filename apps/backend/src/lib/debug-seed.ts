import { z } from "zod";
import { normalizeTaskTemporalFields } from "./task-normalization";
import { insertHabitSchema } from "../types/habit";
import { insertInboxItemSchema, insertInboxSectionSchema } from "../types/inbox";
import { insertProjectSchema } from "../types/project";
import { insertSubtaskSchema } from "../types/subtask";
import { insertTagSchema } from "../types/tag";
import { insertTaskSchema } from "../types/task";

const seedSectionSchema = z.object({
    name: z.string().min(1).max(200),
    orderIndex: z.number(),
    projectId: z.string().uuid().nullable().optional(),
});

type SeedTaskInput = z.input<typeof insertTaskSchema>;
type SeedHabitInput = z.input<typeof insertHabitSchema> & {
    totalCompletions?: number;
    totalSkips?: number;
    currentStreak?: number;
    longestStreak?: number;
};
type SeedInboxItemInput = z.input<typeof insertInboxItemSchema> & {
    processed?: boolean;
};
type SeedSubtaskInput = z.input<typeof insertSubtaskSchema> & {
    isComplete?: boolean;
};

export function seedDateTime(anchor: Date, dayOffset: number, hours = 12, minutes = 0) {
    return new Date(
        Date.UTC(
            anchor.getUTCFullYear(),
            anchor.getUTCMonth(),
            anchor.getUTCDate() + dayOffset,
            hours,
            minutes,
            0,
            0,
        ),
    ).toISOString();
}

export function seedDate(anchor: Date, dayOffset: number) {
    return seedDateTime(anchor, dayOffset, 0, 0).slice(0, 10);
}

export function createSeedSection(userId: string, input: z.input<typeof seedSectionSchema>) {
    return {
        userId,
        ...seedSectionSchema.parse(input),
    };
}

export function createSeedProject(userId: string, input: z.input<typeof insertProjectSchema>) {
    return {
        userId,
        ...insertProjectSchema.parse(input),
    };
}

export function createSeedInboxSection(userId: string, input: z.input<typeof insertInboxSectionSchema>) {
    return {
        userId,
        ...insertInboxSectionSchema.parse(input),
    };
}

export function createSeedTag(userId: string, input: z.input<typeof insertTagSchema>) {
    return {
        userId,
        ...insertTagSchema.parse(input),
    };
}

export function createSeedTask(userId: string, input: SeedTaskInput) {
    const parsed = insertTaskSchema.parse(input);

    return {
        userId,
        ...parsed,
        ...normalizeTaskTemporalFields(parsed),
    };
}

export function createSeedSubtask(userId: string, taskId: string, input: SeedSubtaskInput) {
    const { isComplete = false, ...contractInput } = input;

    return {
        userId,
        taskId,
        isComplete,
        ...insertSubtaskSchema.parse(contractInput),
    };
}

export function createSeedHabit(userId: string, input: SeedHabitInput) {
    const {
        totalCompletions = 0,
        totalSkips = 0,
        currentStreak = 0,
        longestStreak = 0,
        ...contractInput
    } = input;

    return {
        userId,
        totalCompletions,
        totalSkips,
        currentStreak,
        longestStreak,
        ...insertHabitSchema.parse(contractInput),
    };
}

export function createSeedInboxItem(userId: string, input: SeedInboxItemInput) {
    const { processed = false, ...contractInput } = input;

    return {
        userId,
        processed,
        ...insertInboxItemSchema.parse(contractInput),
    };
}
