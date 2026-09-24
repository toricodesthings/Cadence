/** Centralized query key factory — single source of truth for cache targeting */
export const queryKeys = {
    tasks: {
        all: ["tasks"] as const,
        list: (filters: Record<string, unknown>) => ["tasks", filters] as const,
        detail: (id: string) => ["tasks", id] as const,
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
    appearance: {
        all: ["appearance"] as const,
        /** The user's background photo, cached as a blob (never persisted to IndexedDB by the query cache). */
        backgroundImage: (userId: string | null, imageId: string | null) =>
            ["appearance", "background", userId, imageId] as const,
    },
    ai: {
        conversations: ["ai", "conversations"] as const,
        conversation: (id: string) => ["ai", "conversation", id] as const,
        usage: ["ai", "usage"] as const,
        image: (id: string) => ["ai", "image", id] as const,
    },
} as const;

/** Differentiated stale times for each data type.
 *  Tasks go stale quickly (user edits frequently); tags/projects are stable. */
export const STALE_TIMES = {
    TASKS: 30 * 1000,           // 30s — tasks change frequently
    PROJECTS: 5 * 60 * 1000,    // 5min — projects rarely change
    INBOX: 60 * 1000,           // 1min — inbox items moderate frequency
    TAGS: 10 * 60 * 1000,       // 10min — tags very rarely change
    HABITS: 60 * 1000,          // 1min — habits have moderate frequency
} as const;
