import { z } from "zod";
import { normalizeTaskTemporalFields } from "@cadence/domain/task-temporal";
import { insertHabitSchema } from "@cadence/contracts/habit";
import { insertInboxItemSchema, insertInboxSectionSchema } from "@cadence/contracts/inbox";
import { insertProjectSchema } from "@cadence/contracts/project";
import { insertSubtaskSchema } from "@cadence/contracts/subtask";
import { insertTagSchema } from "@cadence/contracts/tag";
import { insertTaskSchema } from "../tasks/tasks.schema";
import { upsertNoteSchema } from "@cadence/contracts/note";
import type {
    sourceSurfaceEnum,
    confidenceTierEnum,
    focusViewSourceEnum,
} from "../../db/schema";

// ── Schemas ──────────────────────────────────────────────────────────

const seedSectionSchema = z.object({
    name: z.string().min(1).max(200),
    orderIndex: z.number(),
    projectId: z.string().uuid().nullable().optional(),
});

// ── Enum helper types ────────────────────────────────────────────────

type SourceSurface = (typeof sourceSurfaceEnum.enumValues)[number];
type ConfidenceTier = (typeof confidenceTierEnum.enumValues)[number];
type FocusViewSource = (typeof focusViewSourceEnum.enumValues)[number];

// ── Input types ──────────────────────────────────────────────────────

export type SeedTaskInput = z.input<typeof insertTaskSchema>;
export type SeedHabitInput = z.input<typeof insertHabitSchema> & {
    totalCompletions?: number;
    totalSkips?: number;
    currentStreak?: number;
    longestStreak?: number;
};
export type SeedInboxItemInput = z.input<typeof insertInboxItemSchema> & {
    processed?: boolean;
};
export type SeedSubtaskInput = z.input<typeof insertSubtaskSchema> & {
    isComplete?: boolean;
};
export type SeedTaskNoteInput = {
    body: string;
};
export type SeedNlpMetadataInput = {
    parserVersion?: string;
    sourceSurface?: SourceSurface;
    rawInput: string;
    cleanedTitle: string;
    parseResult?: Record<string, unknown>;
    confidenceTier?: ConfidenceTier;
};
export type SeedSavedFocusViewInput = {
    name: string;
    definition?: Record<string, unknown>;
    isPinned?: boolean;
    source?: FocusViewSource;
    orderIndex?: number;
};

// ── Temporal helpers ─────────────────────────────────────────────────

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

// ── Fixture builders ─────────────────────────────────────────────────

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

export function createSeedTaskNote(userId: string, taskId: string, input: SeedTaskNoteInput) {
    const parsed = upsertNoteSchema.parse(input);
    const body = parsed.body;
    const excerpt = body.slice(0, 120);
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    const headingCount = (body.match(/^#{1,6}\s/gm) ?? []).length;

    return {
        userId,
        taskId,
        body,
        excerpt,
        wordCount,
        headingCount,
        version: 1,
    };
}

export function createSeedNlpMetadata(userId: string, taskId: string, input: SeedNlpMetadataInput) {
    return {
        userId,
        taskId,
        parserVersion: input.parserVersion ?? "2.0.0",
        sourceSurface: input.sourceSurface ?? "quick_add",
        rawInput: input.rawInput,
        cleanedTitle: input.cleanedTitle,
        parseResult: input.parseResult ?? {},
        confidenceTier: input.confidenceTier ?? "medium",
        isCurrent: true,
    };
}

export function createSeedSavedFocusView(userId: string, input: SeedSavedFocusViewInput) {
    return {
        userId,
        name: input.name,
        definition: input.definition ?? {},
        isPinned: input.isPinned ?? false,
        source: input.source ?? "preset",
        orderIndex: input.orderIndex ?? 0,
    };
}
