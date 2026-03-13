/**
 * Canonical frontend settings types — mirrors the backend SETTINGS_DEFAULTS shape.
 * The backend normalizes on read, so the frontend always receives the full shape.
 */

export interface UserSettings {
    profile: {
        pronouns: string;
        birthday: string | null;
    };
    appearance: {
        theme: "twilight" | "daylight" | "system";
        accentIntensity: "soft" | "balanced" | "vivid";
        motion: "system" | "full" | "reduced";
        density: "comfortable" | "compact";
    };
    notifications: {
        email: boolean;
        browser: boolean;
        taskReminders: boolean;
        habitReminders: boolean;
        dueDateAlerts: boolean;
        quietHoursEnabled: boolean;
        quietHoursStart: string | null;
        quietHoursEnd: string | null;
    };
    dateTime: {
        weekStart: "Sunday" | "Monday" | "Saturday";
        timezone: string;
        timeDisplay: "12h" | "24h";
        dateStyle: "mdy" | "dmy" | "ymd";
    };
    calendar: {
        defaultView: "month" | "week" | "day";
        showWeekNumbers: boolean;
        showWeekends: boolean;
        holidays: {
            enabled: boolean;
            usePreciseLocation: boolean;
            locationMode: "auto" | "manual";
            countryCode: string | null;
            subdivisionCode: string | null;
            promptDismissedAt: string | null;
        };
    };
    tasks: {
        defaultDueDate: "None" | "Today" | "Tomorrow" | "Next Week" | null;
        defaultView: "list" | "kanban";
        defaultPriority: "none" | "low" | "medium" | "high" | "urgent";
        defaultDurationMinutes: 15 | 30 | 45 | 60 | 90 | null;
        newTaskPlacement: "top" | "bottom";
        openDetailOnCreate: boolean;
        hideCompleted: boolean;
        hideTrash: boolean;
        showDoneCelebration: boolean;
    };
    shortcuts: {
        enabled: boolean;
        showHints: boolean;
        bindings: {
            commandPalette: string;
            newTask: string;
            focusSearch: string;
            toggleView: string;
            completeTask: string;
            archiveTask: string;
        };
    };
    integrations: {
        googleCalendar: {
            enabled: boolean;
            syncMode: "one_way" | "two_way";
            includeCompleted: boolean;
        };
        appleCalendar: {
            enabled: boolean;
            syncMode: "one_way" | "two_way";
        };
        notion: {
            enabled: boolean;
            createBacklinks: boolean;
        };
        obsidian: {
            enabled: boolean;
            appendTaskLinks: boolean;
        };
        ics: {
            enabled: boolean;
            includeHabits: boolean;
        };
    };
    privacy: {
        usageDiagnostics: boolean;
        crashReports: boolean;
        storeRecentSearches: boolean;
        storeDismissedPrompts: boolean;
        exportFormat: "json" | "csv";
        lastExportRequestedAt: string | null;
    };
    /** @deprecated — migrated to tasks.defaultView by the backend */
    preferredView?: "list" | "kanban";
}

/** Canonical defaults — mirrors backend SETTINGS_DEFAULTS for local cache hydration */
export const SETTINGS_DEFAULTS: UserSettings = {
    profile: { pronouns: "", birthday: null },
    appearance: {
        theme: "twilight",
        accentIntensity: "balanced",
        motion: "system",
        density: "comfortable",
    },
    notifications: {
        email: true,
        browser: false,
        taskReminders: true,
        habitReminders: true,
        dueDateAlerts: true,
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
    },
    dateTime: {
        weekStart: "Sunday",
        timezone: "local",
        timeDisplay: "12h",
        dateStyle: "mdy",
    },
    calendar: {
        defaultView: "month",
        showWeekNumbers: false,
        showWeekends: true,
        holidays: {
            enabled: true,
            usePreciseLocation: false,
            locationMode: "auto",
            countryCode: null,
            subdivisionCode: null,
            promptDismissedAt: null,
        },
    },
    tasks: {
        defaultDueDate: null,
        defaultView: "list",
        defaultPriority: "none",
        defaultDurationMinutes: null,
        newTaskPlacement: "bottom",
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
        googleCalendar: { enabled: false, syncMode: "one_way", includeCompleted: false },
        appleCalendar: { enabled: false, syncMode: "one_way" },
        notion: { enabled: false, createBacklinks: false },
        obsidian: { enabled: false, appendTaskLinks: false },
        ics: { enabled: false, includeHabits: false },
    },
    privacy: {
        usageDiagnostics: true,
        crashReports: true,
        storeRecentSearches: true,
        storeDismissedPrompts: true,
        exportFormat: "json",
        lastExportRequestedAt: null,
    },
};

// Deep partial for type-safe patch bodies
export type DeepPartial<T> = T extends object ? {
    [P in keyof T]?: DeepPartial<T[P]>;
} : T;
