/**
 * Canonical settings defaults — the single source of truth.
 *
 * Every new section added to the settings schema must have a default here.
 * Backend route normalization, frontend hydration, and tests all depend
 * on this object.
 */

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
            items: [] as Array<{ id: string; label: string; monthDay: string; emoji: string | null; notify: boolean }>,
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
} as const satisfies Record<string, unknown>;

export type CanonicalSettings = typeof SETTINGS_DEFAULTS;
