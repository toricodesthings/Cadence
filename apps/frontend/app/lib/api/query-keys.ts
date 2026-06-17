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
    },
    tags: {
        all: ["tags"] as const,
    },
    habits: {
        all: ["habits"] as const,
        weeklyAll: ["habits", "weekly"] as const,
        weekly: (filters: Record<string, unknown>) => ["habits", "weekly", filters] as const,
        detail: (id: string) => ["habits", id] as const,
        monthly: (id: string, year: number, month: number) => ["habits", id, "monthly", year, month] as const,
        unresolved: ["habits", "unresolved"] as const,
    },
    ai: {
        conversations: ["ai", "conversations"] as const,
        conversation: (id: string) => ["ai", "conversation", id] as const,
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
