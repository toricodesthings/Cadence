/** Centralized query key factory — single source of truth for cache targeting */
export const queryKeys = {
    tasks: {
        all: ["tasks"] as const,
        list: (filters: Record<string, unknown>) => ["tasks", filters] as const,
        detail: (id: string) => ["tasks", id] as const,
    },
    /** A task's dedicated note, by canonical owner (the series for a recurring task). Nested under `tasks` so a task refresh refreshes it. */
    notes: {
        detail: (ownerId: string) => ["tasks", ownerId, "note"] as const,
    },
    projects: {
        all: ["projects"] as const,
        detail: (id: string) => ["projects", id] as const,
    },
    inbox: {
        all: ["inbox"] as const,
        notes: ["inbox", "kept"] as const,
    },
    tags: {
        all: ["tags"] as const,
    },
    habits: {
        all: ["habits"] as const,
        weeklyAll: ["habits", "weekly"] as const,
        weekly: (filters: Record<string, unknown>) => ["habits", "weekly", filters] as const,
        detail: (id: string) => ["habits", id] as const,
    },
    location: {
        all: ["location"] as const,
        approximate: (userId: string | null) => ["location", "approximate", userId] as const,
    },
    weather: {
        all: ["weather"] as const,
        current: (latitude: number | null, longitude: number | null) => ["weather", latitude, longitude] as const,
    },
    holidays: {
        year: (year: number, country: string | null, subdivision: string | null, locale: string) =>
            ["holidays", year, country, subdivision, locale] as const,
        subdivisions: (country: string | null, year: number, locale: string) =>
            ["holiday-subdivisions", country, year, locale] as const,
    },
    appearance: {
        all: ["appearance"] as const,
        /** The user's background photo, cached as a blob (never persisted to IndexedDB by the query cache). */
        backgroundImage: (userId: string | null, imageId: string | null) =>
            ["appearance", "background", userId, imageId] as const,
    },
    settings: {
        notificationState: (userId: string | undefined) => ["settings", userId ?? "anonymous", "notification-state"] as const,
        focusViews: (userId: string | undefined) => ["settings", userId ?? "anonymous", "focusViews"] as const,
    },
    ai: {
        conversations: ["ai", "conversations"] as const,
        conversation: (id: string) => ["ai", "conversation", id] as const,
        usage: ["ai", "usage"] as const,
        image: (id: string) => ["ai", "image", id] as const,
    },
    auth: {
        accounts: ["auth", "accounts"] as const,
    },
    dataExport: ["data-export"] as const,
    connections: {
        all: ["connections"] as const,
        request: (request: string) => ["connections", "request", request] as const,
    },
} as const;

/** Differentiated stale times for each data type.
 *  Tasks go stale quickly (user edits frequently); tags/projects are stable. */
export const STALE_TIMES = {
    OFFLINE_WINDOW: 60 * 60 * 1000, // 1 hour — background warming freshness
    TASKS: 30 * 1000,           // 30s — tasks change frequently
    NOTES: 5 * 1000,            // 5s — an open note is also polled, so edits from elsewhere show up
    PROJECTS: 5 * 60 * 1000,    // 5min — projects rarely change
    INBOX: 60 * 1000,           // 1min — inbox items moderate frequency
    TAGS: 10 * 60 * 1000,       // 10min — tags very rarely change
    NOTIFICATIONS: 60 * 1000,   // 1min — shared reminder state across surfaces
    HABITS: 60 * 1000,          // 1min — habits have moderate frequency
    HOLIDAYS: 7 * 24 * 60 * 60 * 1000, // 7 days — reuse a year's dates across calendar views
    HOLIDAY_REGIONS: 24 * 60 * 60 * 1000, // 1 day — country and subdivision metadata
} as const;
