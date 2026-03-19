export type HabitStatus = "COMPLETED" | "SKIPPED" | "PENDING";

export type TargetMode = "AMBIENT" | "ANCHOR" | "BLOCK";

export interface HabitLog {
    id: string; // can be uuid or a virtual string prefix
    habitId: string;
    userId?: string;
    status: HabitStatus;
    targetDate: string; // YYYY-MM-DD
    completedAt: string | null;
    resolvedAt?: string | null;
    createdAt?: string;
}

export interface Habit {
    id: string;
    userId: string;
    title: string;
    description: string | null;
    notes: string | null;
    recurrenceRule: string;
    targetTime: string | null;
    reminderEnabled: boolean;
    totalCompletions: number;
    totalSkips: number;
    currentStreak: number;
    longestStreak: number;
    colorAccent: string;
    archived: boolean;
    createdAt: string;
    updatedAt: string;

    // New fields
    targetMode: TargetMode;
    projectId: string | null;
    sortOrder: number;
    pausedUntil: string | null;
    tagIds?: string[];

    // Virtual array returned by the weekly endpoint
    logs?: HabitLog[];

    // Derived summary fields (weekly endpoint only)
    isDueToday?: boolean;
    isOverdue?: boolean;
    pendingCountInWindow?: number;
    completedCountInWindow?: number;
    scheduledCountInWindow?: number;
    adherenceRateInWindow?: number;
}

export interface InsertHabit {
    title: string;
    description?: string | null;
    recurrenceRule: string;
    targetTime?: string | null;
    reminderEnabled?: boolean;
    colorAccent?: string;
    archived?: boolean;
    targetMode?: TargetMode;
    projectId?: string | null;
    tagIds?: string[];
    sortOrder?: number;
    pausedUntil?: string | null;
}

export interface UpdateHabit extends Partial<InsertHabit> {
    notes?: string | null;
}

export interface ResolveHabitAction {
    targetDate: string; // YYYY-MM-DD
    status: HabitStatus;
}

export interface UnresolvedHabitSummary {
    habitId: string;
    title: string;
    targetTime: string | null;
    targetMode: string;
    latestTargetDate: string;
    missedCount: number;
    actionableDates: string[];
}
