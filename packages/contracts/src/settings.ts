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
// The DB storage schema (`userSettingsSchema`) is derived from this.
// The PATCH schema (`settingsPatchSchema`) is derived with `deepPartial`.
// Defaults in `SETTINGS_DEFAULTS` must satisfy this schema exactly.

export const userSettingsSchema = z.object({
    profile: z.object({
        pronouns: z.string().optional(),
        birthday: z.string().nullable().optional(),
    }).optional(),
    appearance: z.object({
        theme: z.enum(["twilight", "daylight", "system", "custom"]),
        accentIntensity: z.enum(["soft", "balanced", "vivid"]),
        motion: z.enum(["system", "full", "reduced"]),
        density: z.enum(["comfortable", "compact"]),
        palette: z.enum([
            "lantern", "ember", "rose", "violet",
            "sapphire", "jade", "copper", "frost"
        ]).optional(),
        themePreset: z.enum([
            "default", "daylight-default", "spring-bloom",
            "summer-coast", "autumn-hearth", "winter-frost",
            "midnight-garden", "golden-hour", "custom"
        ]).optional(),
        backgroundMode: z.enum(["theme", "custom"]).optional(),
        backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        backgroundGradient: z.string().nullable().optional(),
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
                startedOn: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
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
            focusViewPresentation: z.enum(["compact", "expanded"]).optional(),
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
            rescheduleTask: z.string().optional(),
            pinTask: z.string().optional(),
            openMenu: z.string().optional(),
            editObject: z.string().optional(),
            quickActions: z.string().optional(),
            capture: z.string().optional(),
            quickAddTask: z.string().optional(),
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
    assistant: z.object({
        persona: z.enum(["secretary", "coach", "minimalist", "companion"]).optional(),
        tone: z.enum(["neutral", "warm", "playful", "clinical"]).optional(),
        verbosity: z.enum(["terse", "balanced", "detailed"]).optional(),
        emoji: z.boolean().optional(),
        nickname: z.string().max(40).nullable().optional(),
        assistantName: z.string().max(40).optional(),
        customInstructions: z.string().max(600).nullable().optional(),
        proactiveSuggestions: z.boolean().optional(),
        memoryEnabled: z.boolean().optional(),
        adaptiveTone: z.boolean().optional(),
    }).optional(),
    // Legacy field — accepted for backward compat; migrated to tasks.defaultView
    preferredView: z.enum(["list", "kanban"]).optional(),
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

// ── Deep-partial utility (Zod 4 removed .deepPartial()) ──

export type DeepPartial<T> = T extends Array<infer U>
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
export const settingsPatchSchema = deepPartial(userSettingsSchema) as z.ZodType<DeepPartial<UserSettings>>;

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

// ── Canonical settings defaults — single source of truth ──

export const SETTINGS_DEFAULTS = {
    profile: {
        pronouns: "",
        birthday: null as string | null,
    },
    appearance: {
        theme: "twilight" as const,
        accentIntensity: "balanced" as const,
        motion: "system" as const,
        density: "comfortable" as const,
        palette: "lantern" as const,
        themePreset: "default" as const,
        backgroundMode: "theme" as const,
        backgroundColor: null as string | null,
        backgroundGradient: null as string | null,
    },
    notifications: {
        email: true,
        browser: false,
        taskReminders: true,
        habitReminders: true,
        dueDateAlerts: true,
        quietHoursEnabled: false,
        quietHoursStart: null as string | null,
        quietHoursEnd: null as string | null,
        habitReminderLeadMinutes: 15 as 5 | 10 | 15 | 30,
        showHabitNavDueCount: true,
        bundleMissedRoutinePrompts: true,
    },
    dateTime: {
        weekStart: "Sunday" as const,
        timezone: "local",
        timeDisplay: "12h" as const,
        dateStyle: "mdy" as const,
    },
    calendar: {
        defaultView: "month" as const,
        showWeekNumbers: false,
        showWeekends: true,
        clutter: {
            showAllDay: true,
            showTimedTasks: true,
            showHabitAnchors: true,
        },
        holidays: {
            enabled: true,
            usePreciseLocation: false,
            locationMode: "auto" as const,
            countryCode: null as string | null,
            subdivisionCode: null as string | null,
            promptDismissedAt: null as string | null,
        },
        personalEvents: {
            enabled: true,
            items: [] as Array<{ id: string; label: string; monthDay: string; emoji: string | null; notify: boolean; startedOn: string | null }>,
        },
    },
    tasks: {
        defaultDueDate: null as "None" | "Today" | "Tomorrow" | "Next Week" | null,
        defaultView: "list" as const,
        defaultPriority: "none" as const,
        defaultDurationMinutes: null as 15 | 30 | 45 | 60 | 90 | null,
        newTaskPlacement: "bottom" as const,
        openDetailOnCreate: false,
        hideCompleted: false,
        hideTrash: false,
        showDoneCelebration: true,
        quickAdd: {
            preset: "planner" as const,
            style: "label" as const,
            actions: ["date", "priority", "project"] as Array<"date" | "priority" | "project" | "tag">,
        },
        intelligence: {
            nlpEnabled: true,
            autoParseOnCapture: true,
            confidenceThreshold: "medium" as const,
            showExplanations: true,
            smartSortEnabled: true,
            focusViewsEnabled: true,
            focusViewPresentation: "compact" as const,
            lowStimulationMode: false,
            dismissedEntityIds: [] as string[],
            dismissedEntities: [] as Array<{ entityType: string; dismissedAt: string; scope: "once" | "always" }>,
        },
    },
    shortcuts: {
        enabled: true,
        showHints: true,
        bindings: {
            commandPalette: "mod+k",
            newTask: "t",
            focusSearch: "/",
            toggleView: "v",
            completeTask: "c",
            archiveTask: "e",
            rescheduleTask: "r",
            pinTask: "p",
            openMenu: "m",
            editObject: "e",
            quickActions: ".",
            capture: "q",
            quickAddTask: "shift+q",
        },
    },
    integrations: {
        googleCalendar: {
            enabled: false,
            syncMode: "one_way" as const,
            includeCompleted: false,
        },
        appleCalendar: {
            enabled: false,
            syncMode: "one_way" as const,
        },
        notion: {
            enabled: false,
            createBacklinks: false,
        },
        obsidian: {
            enabled: false,
            appendTaskLinks: false,
        },
        ics: {
            enabled: false,
            includeHabits: false,
        },
    },
    privacy: {
        usageDiagnostics: true,
        crashReports: true,
        storeRecentSearches: true,
        storeDismissedPrompts: true,
        exportFormat: "json" as const,
        lastExportRequestedAt: null as string | null,
    },
    assistant: {
        persona: "secretary" as const,
        tone: "neutral" as const,
        verbosity: "balanced" as const,
        emoji: true,
        nickname: null as string | null,
        assistantName: "Janny",
        customInstructions: null as string | null,
        proactiveSuggestions: true,
        memoryEnabled: false,
        adaptiveTone: true,
    },
} as const satisfies Record<string, unknown>;

export type CanonicalSettings = typeof SETTINGS_DEFAULTS;

/** Personal calendar event entry (element of calendar.personalEvents.items). */
export type PersonalEvent = CanonicalSettings["calendar"]["personalEvents"]["items"][number];
