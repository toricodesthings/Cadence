export type HabitStatus = "COMPLETED" | "SKIPPED" | "PENDING";

export interface HabitLog {
    id: string; // can be uuid or a virtual string prefix
    habitId: string;
    userId?: string;
    status: HabitStatus;
    targetDate: string; // ISO Full time
    completedAt: string | null;
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

    // Virtual array returned by the weekly endpoint
    logs?: HabitLog[];
}

export interface InsertHabit {
    title: string;
    description?: string | null;
    recurrenceRule: string;
    targetTime?: string | null;
    reminderEnabled?: boolean;
    colorAccent?: string;
    archived?: boolean;
}

export interface UpdateHabit extends Partial<InsertHabit> {
    notes?: string | null;
}

export interface ResolveHabitAction {
    targetDate: string; // ISO date matching the log
    status: HabitStatus;
}
