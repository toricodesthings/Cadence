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
        holidays: {
            enabled: true,
            usePreciseLocation: false,
            locationMode: "auto" as const,
            countryCode: null as string | null,
            subdivisionCode: null as string | null,
            promptDismissedAt: null as string | null,
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
