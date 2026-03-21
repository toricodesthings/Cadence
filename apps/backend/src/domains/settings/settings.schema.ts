import { z } from "zod";

// ── Focus View schemas ──

export const focusViewSourceSchema = z.enum(["preset", "composed", "manual"]);
export const focusViewSortModeSchema = z.enum(["smart", "priority", "manual"]);
export const focusViewDefinitionSchema = z.object({
    states: z.array(z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"])).min(1).max(8),
    projectIds: z.array(z.string().uuid()).max(100).default([]),
    tagIds: z.array(z.string().uuid()).max(100).default([]),
    needsDate: z.boolean(),
    needsProject: z.boolean(),
    priorityMin: z.number().int().min(0).max(4).nullable(),
    effortMax: z.number().int().min(1).max(3).nullable(),
    dueWindow: z.enum(["overdue", "today", "this_week", "this_month"]).nullable(),
    waitingOnly: z.boolean(),
    missingStructureOnly: z.boolean(),
    sortMode: focusViewSortModeSchema,
});
export type FocusViewDefinitionInput = z.infer<typeof focusViewDefinitionSchema>;

export const savedFocusViewInputSchema = z.object({
    name: z.string().min(1).max(120),
    definition: focusViewDefinitionSchema,
    isPinned: z.boolean().optional(),
    source: focusViewSourceSchema.optional(),
    orderIndex: z.number().optional(),
});
export type SavedFocusViewInput = z.infer<typeof savedFocusViewInputSchema>;

export const savedFocusViewPatchSchema = savedFocusViewInputSchema.partial().extend({
    definition: focusViewDefinitionSchema.optional(),
});
export type SavedFocusViewPatch = z.infer<typeof savedFocusViewPatchSchema>;

// ── Canonical settings schema — single source of truth ──
//
// Every settings section, field name, and allowed value is defined here once.
// The DB storage schema (`UserSettingsSchema`) is derived from this.
// The PATCH schema (`settingsPatchSchema`) is derived with `.deepPartial()`.
// Defaults in `settings-defaults.ts` must satisfy this schema exactly.

export const userSettingsSchema = z.object({
    profile: z.object({
        pronouns: z.string().optional(),
        birthday: z.string().nullable().optional(),
    }).optional(),
    appearance: z.object({
        theme: z.enum(["twilight", "daylight", "system"]),
        accentIntensity: z.enum(["soft", "balanced", "vivid"]),
        motion: z.enum(["system", "full", "reduced"]),
        density: z.enum(["comfortable", "compact"]),
    }).optional(),
    notifications: z.object({
        email: z.boolean(),
        browser: z.boolean().optional(),
        taskReminders: z.boolean().optional(),
        habitReminders: z.boolean().optional(),
        dueDateAlerts: z.boolean().optional(),
        quietHoursEnabled: z.boolean().optional(),
        quietHoursStart: z.string().nullable().optional(),
        quietHoursEnd: z.string().nullable().optional(),
        habitReminderLeadMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)]).optional(),
        showHabitNavDueCount: z.boolean().optional(),
        bundleMissedRoutinePrompts: z.boolean().optional(),
    }).optional(),
    dateTime: z.object({
        weekStart: z.enum(["Sunday", "Monday", "Saturday"]),
        timezone: z.string(),
        timeDisplay: z.enum(["12h", "24h"]),
        dateStyle: z.enum(["mdy", "dmy", "ymd"]).optional(),
    }).optional(),
    calendar: z.object({
        defaultView: z.enum(["month", "week", "day"]).optional(),
        showWeekNumbers: z.boolean().optional(),
        showWeekends: z.boolean().optional(),
        clutter: z.object({
            showAllDay: z.boolean().optional(),
            showTimedTasks: z.boolean().optional(),
            showHabitAnchors: z.boolean().optional(),
        }).optional(),
        holidays: z.object({
            enabled: z.boolean(),
            usePreciseLocation: z.boolean(),
            locationMode: z.enum(["auto", "manual"]),
            countryCode: z.string().nullable(),
            subdivisionCode: z.string().nullable(),
            promptDismissedAt: z.string().nullable(),
        }).optional(),
        personalEvents: z.object({
            enabled: z.boolean(),
            items: z.array(z.object({
                id: z.string().min(1).max(24),
                label: z.string().min(1).max(80),
                monthDay: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
                emoji: z.string().max(4).nullable(),
                notify: z.boolean(),
            })).max(50),
        }).optional(),
    }).optional(),
    tasks: z.object({
        defaultDueDate: z.enum(["None", "Today", "Tomorrow", "Next Week"]).nullable().optional(),
        defaultView: z.enum(["list", "kanban"]).optional(),
        defaultPriority: z.enum(["none", "low", "medium", "high", "urgent"]).optional(),
        defaultDurationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).nullable().optional(),
        newTaskPlacement: z.enum(["top", "bottom"]).optional(),
        openDetailOnCreate: z.boolean().optional(),
        hideTrash: z.boolean().optional(),
        hideCompleted: z.boolean().optional(),
        showDoneCelebration: z.boolean().optional(),
        quickAdd: z.object({
            preset: z.enum(["minimal", "planner", "power"]).optional(),
            style: z.enum(["icon", "label"]).optional(),
            actions: z.array(z.enum(["date", "priority", "project", "tag"])).optional(),
        }).optional(),
        intelligence: z.object({
            nlpEnabled: z.boolean().optional(),
            autoParseOnCapture: z.boolean().optional(),
            confidenceThreshold: z.enum(["high", "medium", "low"]).optional(),
            showExplanations: z.boolean().optional(),
            smartSortEnabled: z.boolean().optional(),
            focusViewsEnabled: z.boolean().optional(),
            lowStimulationMode: z.boolean().optional(),
            dismissedEntityIds: z.array(z.string()).optional(),
            dismissedEntities: z.array(z.object({
                entityType: z.string(),
                dismissedAt: z.string(),
                scope: z.enum(["once", "always"]),
            })).optional(),
        }).optional(),
    }).optional(),
    shortcuts: z.object({
        enabled: z.boolean().optional(),
        showHints: z.boolean().optional(),
        bindings: z.object({
            commandPalette: z.string().optional(),
            newTask: z.string().optional(),
            focusSearch: z.string().optional(),
            toggleView: z.string().optional(),
            completeTask: z.string().optional(),
            archiveTask: z.string().optional(),
        }).optional(),
    }).optional(),
    integrations: z.object({
        googleCalendar: z.object({
            enabled: z.boolean().optional(),
            syncMode: z.enum(["one_way", "two_way"]).optional(),
            includeCompleted: z.boolean().optional(),
        }).optional(),
        appleCalendar: z.object({
            enabled: z.boolean().optional(),
            syncMode: z.enum(["one_way", "two_way"]).optional(),
        }).optional(),
        notion: z.object({
            enabled: z.boolean().optional(),
            createBacklinks: z.boolean().optional(),
        }).optional(),
        obsidian: z.object({
            enabled: z.boolean().optional(),
            appendTaskLinks: z.boolean().optional(),
        }).optional(),
        ics: z.object({
            enabled: z.boolean().optional(),
            includeHabits: z.boolean().optional(),
        }).optional(),
    }).optional(),
    privacy: z.object({
        usageDiagnostics: z.boolean().optional(),
        crashReports: z.boolean().optional(),
        storeRecentSearches: z.boolean().optional(),
        storeDismissedPrompts: z.boolean().optional(),
        exportFormat: z.enum(["json", "csv"]).optional(),
        lastExportRequestedAt: z.string().nullable().optional(),
    }).optional(),
    // Legacy field — accepted for backward compat; migrated to tasks.defaultView
    preferredView: z.enum(["list", "kanban"]).optional(),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

// ── Deep-partial utility (Zod 4 removed .deepPartial()) ──

type DeepPartial<T> = T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
        ? { [K in keyof T]?: DeepPartial<T[K]> }
        : T;

/** Recursively make every property in a Zod object schema optional. */
function deepPartial(schema: z.ZodType): z.ZodType {
    if (schema instanceof z.ZodObject) {
        const shape = (schema as z.ZodObject<any>).shape;
        const out: Record<string, z.ZodType> = {};
        for (const [k, v] of Object.entries(shape)) {
            out[k] = deepPartial(v as z.ZodType).optional();
        }
        return z.object(out);
    }
    if (schema instanceof z.ZodOptional) return deepPartial((schema as any).unwrap()).optional();
    if (schema instanceof z.ZodNullable) return deepPartial((schema as any).unwrap()).nullable();
    if (schema instanceof z.ZodArray) return z.array(deepPartial((schema as any).element));
    return schema;
}

// Patch schema — recursively partial version of the canonical schema.
// Every field at every nesting level is optional, allowing sparse PATCH updates.
export const settingsPatchSchema = deepPartial(userSettingsSchema) as z.ZodType<DeepPartial<UserSettings>>;

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
