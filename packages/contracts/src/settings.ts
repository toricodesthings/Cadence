import { z } from "zod";
import { instantSchema, localDateSchema, zoneSchema } from "./common";
import { TASK_PRIORITY_NAMES } from "./constants";
import { DATE_STYLES } from "@cadence/nlp/core";
import type { FocusViewDefinition } from "@cadence/nlp/focus-views";

// ── Focus View schemas ──

export const focusViewSourceSchema = z.enum(["preset", "composed", "manual"]);
export type FocusViewSource = z.infer<typeof focusViewSourceSchema>;
export const focusViewSortModeSchema = z.enum(["smart", "priority", "manual"]);
export const focusViewDefinitionSchema = z.object({
    states: z.array(z.enum(["ACTIVE", "WAITING", "COMPLETE", "ARCHIVED"])).min(1).max(8),
    projectIds: z.array(z.uuid()).max(100).default([]),
    tagIds: z.array(z.uuid()).max(100).default([]),
    needsDate: z.boolean(),
    needsProject: z.boolean(),
    priorityMin: z.number().int().min(0).max(4).nullable(),
    // Defaulted so definitions stored before these filters existed still parse.
    effortMin: z.number().int().min(1).max(3).nullable().default(null),
    effortMax: z.number().int().min(1).max(3).nullable(),
    durationMaxMinutes: z.number().int().min(1).nullable().default(null),
    dueWindow: z.enum(["overdue", "today", "this_week", "this_month"]).nullable(),
    waitingOnly: z.boolean(),
    missingStructureOnly: z.boolean(),
    sortMode: focusViewSortModeSchema,
}) satisfies z.ZodType<FocusViewDefinition>; // nlp owns the type; this fails tsc if they drift
export type FocusViewDefinitionInput = z.infer<typeof focusViewDefinitionSchema>;

export const savedFocusViewInputSchema = z.object({
    name: z.string().min(1).max(120),
    definition: focusViewDefinitionSchema,
    isPinned: z.boolean().optional(),
    source: focusViewSourceSchema.optional(),
    orderIndex: z.number().optional(),
});

export const savedFocusViewPatchSchema = savedFocusViewInputSchema.partial().extend({
    definition: focusViewDefinitionSchema.optional(),
});

export const savedFocusViewRowSchema = z.object({
    id: z.uuid(),
    userId: z.uuid(),
    name: z.string(),
    definition: z.record(z.string(), z.unknown()),
    isPinned: z.boolean(),
    source: focusViewSourceSchema,
    orderIndex: z.number(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
});

export type SavedFocusViewRow = z.infer<typeof savedFocusViewRowSchema>;

/** The row with its definition parsed (the column is loose jsonb). */
export const savedFocusViewSchema = savedFocusViewRowSchema.extend({ definition: focusViewDefinitionSchema });
export type SavedFocusView = z.infer<typeof savedFocusViewSchema>;

// ── Personal calendar event (element of calendar.personalEvents.items) ──

export const personalEventSchema = z.object({
    id: z.string().min(1).max(24),
    label: z.string().min(1).max(80),
    monthDay: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/), // "MM-DD"
    emoji: z.string().max(4).nullable(),
    notify: z.boolean(),
    startedOn: localDateSchema.nullable(),
    // A palette key like the routine colours; missing or null means no colour (the default tint).
    color: z.string().max(30).nullable().optional(),
});
export type PersonalEvent = z.infer<typeof personalEventSchema>;

// ── Location (element shapes of settings.location) ──

export const locationModeSchema = z.enum(["off", "approximate", "precise", "manual"]);
export type LocationMode = z.infer<typeof locationModeSchema>;

export const savedCitySchema = z.object({
    name: z.string().min(1).max(120),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
});
export type SavedCity = z.infer<typeof savedCitySchema>;

// ── Photo background (settings.appearance.backgroundImage) ──
//
// The image itself lives in private object storage. Settings keep its opaque id
// (owned by the upload/delete routes, never writable through PATCH), the colours
// the client read from it at upload, and the user's display adjustments.

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const BACKGROUND_IMAGE_LIMITS = {
    /** Largest compressed file the API stores, in bytes. */
    maxBytes: 2.5 * 1024 * 1024,
    /** Longest edge the client resizes to before upload. */
    maxDimension: 2560,
    maxSwatches: 6,
} as const;

export const backgroundImageSchema = z.object({
    id: z.uuid(),
    /** Average tone of the photo; drives surface and text tokens. */
    dominant: hexColorSchema,
    /** Accent candidates read from the photo, most useful first. */
    swatches: z.array(hexColorSchema).min(1).max(BACKGROUND_IMAGE_LIMITS.maxSwatches),
    /** The swatch the user picked as accent; null = pick automatically. */
    accent: hexColorSchema.nullable(),
    /** 0–100 % of the maximum blur. */
    blur: z.number().int().min(0).max(100),
    /** 20–120 % brightness. */
    brightness: z.number().int().min(20).max(120),
});
export type BackgroundImage = z.infer<typeof backgroundImageSchema>;

export const BACKGROUND_IMAGE_DEFAULTS = { blur: 0, brightness: 80 } as const;

/** Form fields sent with the file on `POST /settings/background`. */
export const backgroundUploadMetaSchema = z.object({
    dominant: hexColorSchema,
    /** Comma-separated hex colours, most useful first. */
    swatches: z
        .string()
        .max(BACKGROUND_IMAGE_LIMITS.maxSwatches * 8)
        .transform((value) => value.split(","))
        .pipe(z.array(hexColorSchema).min(1).max(BACKGROUND_IMAGE_LIMITS.maxSwatches)),
});

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
        // Loading screen scene; "auto" follows the calendar season.
        loadingSeason: z.enum(["auto", "spring", "summer", "autumn", "winter"]).optional(),
        backgroundMode: z.enum(["theme", "custom", "image"]).optional(),
        backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
        backgroundGradient: z.string().nullable().optional(),
        // Kept while the user switches to a theme, so they can switch back; only the delete route clears it.
        backgroundImage: backgroundImageSchema.nullable().optional(),
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
        habitReminderLeadMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).optional(),
        /** Waiting-task check-ins. */
        followUps: z.boolean().optional(),
        /** Timed blocks on the calendar. */
        scheduleAlerts: z.boolean().optional(),
        blockLeadMinutes: z.union([z.literal(0), z.literal(5), z.literal(10), z.literal(15), z.literal(30), z.literal(60)]).optional(),
        /** Fixed blocks (class, shift) get their own, longer lead. */
        fixedLeadMinutes: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60), z.literal(120)]).optional(),
        /** Days before a deadline for the extra heads-up; 0 = none. */
        dueHeadsUpDays: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(7)]).optional(),
        /** Days a missed deadline stays in the list; 0 = the due day only. */
        overdueDays: z.union([z.literal(0), z.literal(1), z.literal(3), z.literal(7)]).optional(),
        /** Yearly events notify this many days ahead (each one a separate alert). */
        eventDaysBefore: z.array(z.union([z.literal(0), z.literal(1), z.literal(7)])).max(3).optional(),
        /** "My morning" and "my evening": deadline and event alerts, and the Defer choices. */
        morningTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        eveningTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        /** Everything stays silent until this instant. */
        pausedUntil: instantSchema.nullable().optional(),
        showHabitNavDueCount: z.boolean().optional(),
        bundleMissedRoutinePrompts: z.boolean().optional(),
    }).optional(),
    dateTime: z.object({
        weekStart: z.enum(["Sunday", "Monday", "Saturday"]),
        // "device" follows the device's zone (the client keeps `users.time_zone` equal to it); an IANA name pins one.
        timezone: z.union([z.literal("device"), zoneSchema]),
        timeDisplay: z.enum(["12h", "24h"]),
        dateStyle: z.enum(DATE_STYLES).optional(),
    }).optional(),
    calendar: z.object({
        defaultView: z.enum(["month", "week", "day"]).optional(),
        showWeekNumbers: z.boolean().optional(),
        showWeekends: z.boolean().optional(),
        /** The hour (0-23) Day and Week open scrolled to. */
        timelineStartHour: z.number().int().min(0).max(23).optional(),
        clutter: z.object({
            showAllDay: z.boolean().optional(),
            showTimedTasks: z.boolean().optional(),
            showHabitAnchors: z.boolean().optional(),
            /** Fixed blocks (timetable). Missing means shown. */
            showFixed: z.boolean().optional(),
        }).optional(),
        holidays: z.object({
            enabled: z.boolean(),
        }).optional(),
        personalEvents: z.object({
            enabled: z.boolean(),
            items: z.array(personalEventSchema).max(50),
        }).optional(),
    }).optional(),
    // App-wide location used by weather and holidays. `approximate` comes from the
    // network (Cloudflare edge geo) and never triggers a browser prompt; `precise`
    // asks the browser only when the user turns it on.
    location: z.object({
        mode: locationModeSchema,
        countryCode: z.string().max(3).nullable(),
        subdivisionCode: z.string().max(10).nullable(),
        city: savedCitySchema.nullable(),
        promptDismissedAt: z.string().nullable(),
    }).optional(),
    weather: z.object({
        enabled: z.boolean(),
    }).optional(),
    tasks: z.object({
        defaultDueDate: z.enum(["None", "Today", "Tomorrow", "Next Week"]).nullable().optional(),
        defaultView: z.enum(["list", "kanban"]).optional(),
        defaultPriority: z.enum(TASK_PRIORITY_NAMES).optional(),
        defaultDurationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).nullable().optional(),
        newTaskPlacement: z.enum(["top", "bottom"]).optional(),
        openDetailOnCreate: z.boolean().optional(),
        hideTrash: z.boolean().optional(),
        hideCompleted: z.boolean().optional(),
        showDoneCelebration: z.boolean().optional(),
        showStreaks: z.boolean().optional(),
        quickAdd: z.object({
            preset: z.enum(["minimal", "planner", "power"]).optional(),
            style: z.enum(["icon", "label"]).optional(),
            actions: z.array(z.enum(["date", "priority", "project", "tag"])).optional(),
        }).optional(),
        intelligence: z.object({
            nlpEnabled: z.boolean().optional(),
            autoParseOnCapture: z.boolean().optional(),
            /** Suggest an Effort from this account's own earlier choices. */
            effortSuggestions: z.boolean().optional(),
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
        // When the person confirmed they are 16+ and accepted the Terms and Privacy Policy, and which revision
        legalAcceptedAt: z.string().nullable().optional(),
        legalVersion: z.string().nullable().optional(),
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

/** The revision of the Terms and Privacy Policy people accept (their `updated` date on cadenceapp.cloud). Bumping it asks everyone to accept again. */
export const LEGAL_VERSION = "2026-09-30";

// ── Deep-partial utility (Zod 4 removed .deepPartial()) ──

export type DeepPartial<T> = T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
        ? { [K in keyof T]?: DeepPartial<T[K]> }
        : T;

/** Every field required, recursively: the inverse of `DeepPartial`. */
export type DeepRequired<T> = T extends Array<infer U>
    ? Array<DeepRequired<U>>
    : T extends object
        ? { [K in keyof T]-?: DeepRequired<T[K]> }
        : T;

/**
 * The full settings the API returns: stored values over `SETTINGS_DEFAULTS`, so
 * every field is present (legacy `preferredView` is folded into tasks.defaultView). (`typeof SETTINGS_DEFAULTS` would do, but its `as const`
 * literals break `=== true/false` comparisons.)
 */
export type SettingsView = DeepRequired<Omit<UserSettings, "preferredView">>;

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

function isPlainObject(value: unknown): value is Record<string, any> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge `source` over `target`: objects merge key by key, arrays and scalars
 * replace. Lays stored settings or a patch over `SETTINGS_DEFAULTS` in both apps.
 */
export function deepMerge(target: any, source: any): any {
    const output = Object.assign({}, target);
    if (isPlainObject(target) && isPlainObject(source)) {
        for (const key of Object.keys(source)) {
            // Defense in depth: never let merge keys reach the object prototype.
            if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
            // Merge object over object; otherwise replace. A target of null or a
            // scalar has no keys to merge into, so the source wins outright.
            output[key] = isPlainObject(source[key]) && isPlainObject(target[key])
                ? deepMerge(target[key], source[key])
                : source[key];
        }
    }
    return output;
}

// Patch schema — recursively partial version of the canonical schema.
export const settingsPatchSchema = deepPartial(userSettingsSchema) as z.ZodType<DeepPartial<UserSettings>>;

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
        loadingSeason: "auto" as const,
        backgroundMode: "theme" as const,
        backgroundColor: null as string | null,
        backgroundGradient: null as string | null,
        backgroundImage: null as BackgroundImage | null,
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
        habitReminderLeadMinutes: 15 as 0 | 5 | 10 | 15 | 30 | 60,
        followUps: true,
        scheduleAlerts: true,
        blockLeadMinutes: 10 as 0 | 5 | 10 | 15 | 30 | 60,
        fixedLeadMinutes: 30 as 0 | 15 | 30 | 60 | 120,
        dueHeadsUpDays: 0 as 0 | 1 | 2 | 7,
        overdueDays: 3 as 0 | 1 | 3 | 7,
        eventDaysBefore: [0] as Array<0 | 1 | 7>,
        morningTime: "09:00",
        eveningTime: "19:00",
        pausedUntil: null as string | null,
        showHabitNavDueCount: true,
        bundleMissedRoutinePrompts: true,
    },
    dateTime: {
        weekStart: "Sunday" as const,
        timezone: "device" as const,
        timeDisplay: "12h" as const,
        dateStyle: "mdy" as const,
    },
    calendar: {
        defaultView: "month" as const,
        showWeekNumbers: false,
        showWeekends: true,
        timelineStartHour: 7,
        clutter: {
            showAllDay: true,
            showTimedTasks: true,
            showHabitAnchors: true,
            showFixed: true,
        },
        holidays: {
            enabled: true,
        },
        personalEvents: {
            enabled: true,
            items: [] as PersonalEvent[],
        },
    },
    location: {
        mode: "approximate" as LocationMode,
        countryCode: null as string | null,
        subdivisionCode: null as string | null,
        city: null as SavedCity | null,
        promptDismissedAt: null as string | null,
    },
    weather: {
        enabled: true,
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
        showStreaks: true,
        quickAdd: {
            preset: "planner" as const,
            style: "label" as const,
            actions: ["date", "priority", "project"] as Array<"date" | "priority" | "project" | "tag">,
        },
        intelligence: {
            nlpEnabled: true,
            autoParseOnCapture: true,
            effortSuggestions: true,
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
        legalAcceptedAt: null as string | null,
        legalVersion: null as string | null,
    },
    assistant: {
        persona: "secretary" as const,
        tone: "neutral" as const,
        verbosity: "balanced" as const,
        emoji: true,
        nickname: null as string | null,
        assistantName: "Emilie",
        customInstructions: null as string | null,
        proactiveSuggestions: true,
        memoryEnabled: false,
        adaptiveTone: true,
    },
} as const satisfies Record<string, unknown>;
