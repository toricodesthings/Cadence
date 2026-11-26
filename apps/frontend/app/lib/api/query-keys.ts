export const queryKeys = {
    effortEvidence: ["effort-evidence"] as const,
    tasks: {
        all: ["tasks"] as const,
        list: (filters: Record<string, unknown>) => ["tasks", filters] as const,
        detail: (id: string) => ["tasks", id] as const,
    },
    notes: {
        search: ["search-notes"] as const,
        detail: (ownerId: string) => ["tasks", ownerId, "note"] as const,
    },
    projects: {
        all: ["projects"] as const,
        detail: (id: string) => ["projects", id] as const,
    },
    listPeople: (listId: string, memberIds: readonly string[]) => ["list-people", listId, memberIds] as const,
    eventPeople: (eventId: string, memberIds: readonly string[]) => ["event-people", eventId, memberIds] as const,
    routinePeople: (habitId: string, memberIds: readonly string[]) => ["routine-people", habitId, memberIds] as const,
    invitePreview: (token: string) => ["invite-preview", token] as const,
    inbox: {
        all: ["inbox"] as const,
        notes: ["inbox", "kept"] as const,
    },
    tags: {
        all: ["tags"] as const,
    },
    personalEvents: {
        all: ["personal-events"] as const,
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
        backgroundImage: (userId: string | null, imageId: string | null) =>
            ["appearance", "background", userId, imageId] as const,
    },
    settings: {
        notificationState: (userId: string | undefined) =>
            ["settings", userId ?? "anonymous", "notification-state"] as const,
        focusViews: (userId: string | undefined) => ["settings", userId ?? "anonymous", "focusViews"] as const,
        devices: (userId: string | undefined) => ["settings", userId ?? "anonymous", "devices"] as const,
    },
    ai: {
        conversations: ["ai", "conversations"] as const,
        conversation: (id: string) => ["ai", "conversation", id] as const,
        usage: ["ai", "usage"] as const,
        memory: ["ai", "memory"] as const,
        duration: (taskId: string, completedAt?: string | null) =>
            ["ai", "memory", "duration", taskId, completedAt ?? "current"] as const,
        durationEvidence: ["ai", "memory", "duration-evidence"] as const,
        planningEvidence: ["ai", "memory", "planning-evidence"] as const,
        planningOffers: ["ai", "memory", "planning-offers"] as const,
        routineDurationAll: ["ai", "memory", "routine-duration"] as const,
        routineDuration: (habitId: string, day: string, time?: string | null) =>
            ["ai", "memory", "routine-duration", habitId, day, time ?? null] as const,
        image: (id: string) => ["ai", "image", id] as const,
    },
    auth: {
        accounts: ["auth", "accounts"] as const,
        sessions: ["auth", "sessions"] as const,
    },
    dataExport: ["data-export"] as const,
    connections: {
        all: ["connections"] as const,
        request: (request: string) => ["connections", "request", request] as const,
    },
} as const;

export const STALE_TIMES = {
    OFFLINE_WINDOW: 60 * 60 * 1000,
    TASKS: 30 * 1000,
    NOTES: 5 * 1000,
    PROJECTS: 5 * 60 * 1000,
    INBOX: 60 * 1000,
    TAGS: 10 * 60 * 1000,
    EVENTS: 10 * 60 * 1000,
    PEOPLE: Infinity,
    NOTIFICATIONS: 60 * 1000,
    HABITS: 60 * 1000,
    HOLIDAYS: 7 * 24 * 60 * 60 * 1000,
    HOLIDAY_REGIONS: 24 * 60 * 60 * 1000,
} as const;
