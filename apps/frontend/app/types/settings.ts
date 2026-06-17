/**
 * Frontend settings view types.
 *
 * The canonical schema + defaults live in @cadence/contracts/settings. The
 * backend normalizes on read, so the frontend always receives the full shape —
 * which is why `UserSettings` here is the fully-required, widened view (not the
 * sparse storage/patch shape). `SETTINGS_DEFAULTS` and `DeepPartial` are
 * re-exported from contracts to keep a single source of truth for the data.
 */
export { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
export type { DeepPartial } from "@cadence/contracts/settings";

export interface PersonalEvent {
    id: string;
    label: string;
    monthDay: string;       // "MM-DD" format
    emoji: string | null;
    notify: boolean;
    startedOn: string | null; // "YYYY-MM-DD" format
}

export interface UserSettings {
    profile: {
        pronouns: string;
        birthday: string | null;
    };
    appearance: {
        theme: "twilight" | "daylight" | "system" | "custom";
        accentIntensity: "soft" | "balanced" | "vivid";
        motion: "system" | "full" | "reduced";
        density: "comfortable" | "compact";
        palette?: "lantern" | "ember" | "rose" | "violet" | "sapphire" | "jade" | "copper" | "frost";
        themePreset?: "default" | "daylight-default" | "spring-bloom" | "summer-coast" | "autumn-hearth" | "winter-frost" | "midnight-garden" | "golden-hour" | "custom";
        backgroundMode?: "theme" | "custom";
        backgroundColor?: string | null;
        backgroundGradient?: string | null;
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
        habitReminderLeadMinutes: 5 | 10 | 15 | 30;
        showHabitNavDueCount: boolean;
        bundleMissedRoutinePrompts: boolean;
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
        clutter: {
            showAllDay: boolean;
            showTimedTasks: boolean;
            showHabitAnchors: boolean;
        };
        holidays: {
            enabled: boolean;
            usePreciseLocation: boolean;
            locationMode: "auto" | "manual";
            countryCode: string | null;
            subdivisionCode: string | null;
            promptDismissedAt: string | null;
        };
        personalEvents: {
            enabled: boolean;
            items: PersonalEvent[];
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
        quickAdd: {
            preset: "minimal" | "planner" | "power";
            style: "icon" | "label";
            actions: Array<"date" | "priority" | "project" | "tag">;
        };
        intelligence: {
            nlpEnabled: boolean;
            autoParseOnCapture: boolean;
            confidenceThreshold: "high" | "medium" | "low";
            showExplanations: boolean;
            lowStimulationMode: boolean;
            smartSortEnabled: boolean;
            focusViewsEnabled: boolean;
            focusViewPresentation: "compact" | "expanded";
            dismissedEntityIds: string[];
            dismissedEntities: Array<{
                entityType: string;
                dismissedAt: string;
                scope: "once" | "always";
            }>;
        };
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
            rescheduleTask: string;
            pinTask: string;
            openMenu: string;
            editObject: string;
            quickActions: string;
            capture: string;
            quickAddTask: string;
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
    assistant: {
        persona: "secretary" | "coach" | "minimalist" | "companion";
        tone: "neutral" | "warm" | "playful" | "clinical";
        verbosity: "terse" | "balanced" | "detailed";
        emoji: boolean;
        nickname: string | null;
        assistantName: string;
        customInstructions: string | null;
        proactiveSuggestions: boolean;
        memoryEnabled: boolean;
        adaptiveTone: boolean;
    };
    /** @deprecated — migrated to tasks.defaultView by the backend */
    preferredView?: "list" | "kanban";
}
