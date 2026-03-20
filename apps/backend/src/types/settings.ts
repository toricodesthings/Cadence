import { z } from "zod";

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
    clientMutationId: z.string().max(100).optional(),
});
export type SavedFocusViewInput = z.infer<typeof savedFocusViewInputSchema>;

export const savedFocusViewPatchSchema = savedFocusViewInputSchema.partial().extend({
    definition: focusViewDefinitionSchema.optional(),
});
export type SavedFocusViewPatch = z.infer<typeof savedFocusViewPatchSchema>;

export const settingsPatchSchema = z.object({
    profile: z.object({
        pronouns: z.string().optional(),
        birthday: z.string().nullable().optional(),
    }).partial().optional(),
    appearance: z.object({
        theme: z.enum(["twilight", "daylight", "system"]).optional(),
        accentIntensity: z.enum(["soft", "balanced", "vivid"]).optional(),
        motion: z.enum(["system", "full", "reduced"]).optional(),
        density: z.enum(["comfortable", "compact"]).optional(),
    }).partial().optional(),
    notifications: z.object({
        email: z.boolean().optional(),
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
    }).partial().optional(),
    dateTime: z.object({
        weekStart: z.enum(["Sunday", "Monday", "Saturday"]).optional(),
        timezone: z.string().optional(),
        timeDisplay: z.enum(["12h", "24h"]).optional(),
        dateStyle: z.enum(["mdy", "dmy", "ymd"]).optional(),
    }).partial().optional(),
    calendar: z.object({
        defaultView: z.enum(["month", "week", "day"]).optional(),
        showWeekNumbers: z.boolean().optional(),
        showWeekends: z.boolean().optional(),
        clutter: z.object({
            showAllDay: z.boolean().optional(),
            showTimedTasks: z.boolean().optional(),
            showHabitAnchors: z.boolean().optional(),
        }).partial().optional(),
        holidays: z.object({
            enabled: z.boolean().optional(),
            usePreciseLocation: z.boolean().optional(),
            locationMode: z.enum(["auto", "manual"]).optional(),
            countryCode: z.string().nullable().optional(),
            subdivisionCode: z.string().nullable().optional(),
            promptDismissedAt: z.string().nullable().optional(),
        }).partial().optional(),
    }).partial().optional(),
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
        }).partial().optional(),
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
        }).partial().optional(),
    }).partial().optional(),
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
        }).partial().optional(),
    }).partial().optional(),
    integrations: z.object({
        googleCalendar: z.object({
            enabled: z.boolean().optional(),
            syncMode: z.enum(["one_way", "two_way"]).optional(),
            includeCompleted: z.boolean().optional(),
        }).partial().optional(),
        appleCalendar: z.object({
            enabled: z.boolean().optional(),
            syncMode: z.enum(["one_way", "two_way"]).optional(),
        }).partial().optional(),
        notion: z.object({
            enabled: z.boolean().optional(),
            createBacklinks: z.boolean().optional(),
        }).partial().optional(),
        obsidian: z.object({
            enabled: z.boolean().optional(),
            appendTaskLinks: z.boolean().optional(),
        }).partial().optional(),
        ics: z.object({
            enabled: z.boolean().optional(),
            includeHabits: z.boolean().optional(),
        }).partial().optional(),
    }).partial().optional(),
    privacy: z.object({
        usageDiagnostics: z.boolean().optional(),
        crashReports: z.boolean().optional(),
        storeRecentSearches: z.boolean().optional(),
        storeDismissedPrompts: z.boolean().optional(),
        exportFormat: z.enum(["json", "csv"]).optional(),
        lastExportRequestedAt: z.string().nullable().optional(),
    }).partial().optional(),
    // Legacy field — accepted for backward compat but migrated to tasks.defaultView
    preferredView: z.enum(["list", "kanban"]).optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
