import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";
import type { PersonalEvent } from "@cadence/contracts/settings";
import type { AppNotification } from "./notification-model";
import { addDays, atLocal, todayIn } from "@cadence/domain/time";
import { deriveReminders, isInQuietHours, isPaused, reminderKindEnabled, type ReminderPrefs } from "@cadence/domain/reminders";
import { formatShortDate, formatTime } from "../utils/date-format";
import { getUserZone } from "../utils/user-zone";

/** A reminder switched on with no time of its own follows the deadline: a block's start, or the due day at "my morning". */
export function deadlineReminderAt(task: Pick<Task, "scheduledStart" | "dueDate">, morningTime = "09:00"): string | null {
    return task.scheduledStart ?? (task.dueDate ? atLocal(task.dueDate, morningTime, getUserZone()) : null);
}

// ── §11.7: Defer choices ──

export type DeferChoice = "10_minutes" | "this_evening" | "tomorrow";

export const DEFER_LABELS: Record<DeferChoice, string> = {
    "10_minutes": "10 minutes",
    "this_evening": "This evening",
    "tomorrow": "Tomorrow",
};

/** The instant (ISO) a notification should resurface after deferral; "evening" and "tomorrow" are wall times in the user's zone. */
export function computeDeferUntil(choice: DeferChoice, now: Date, times: { morningTime?: string; eveningTime?: string } = {}): string {
    const { morningTime = "09:00", eveningTime = "19:00" } = times;
    const zone = getUserZone();
    const today = todayIn(zone, now);
    switch (choice) {
        case "10_minutes":
            return new Date(now.getTime() + 10 * 60_000).toISOString();
        case "this_evening": {
            // If the evening has passed, push to tomorrow evening
            const evening = atLocal(today, eveningTime, zone);
            return Date.parse(evening) > now.getTime() ? evening : atLocal(addDays(today, 1), eveningTime, zone);
        }
        case "tomorrow":
            return atLocal(addDays(today, 1), morningTime, zone);
    }
}

// ── §11.7: Persisted notification state (mirrors notificationState schema) ──

export interface NotificationDismissalState {
    /** Notification ids that have been dismissed this session */
    dismissedIds: Set<string>;
    /** Map of notification id → ISO timestamp when it should resurface */
    deferredUntil: Map<string, string>;
}

// ── §11.7: Step 1 — Pure candidate derivation ──

/**
 * Derive raw notification candidates from current task and habit data.
 * No filtering, no persistence awareness — just raw candidates (rules live in `@cadence/domain/reminders`).
 */
export function deriveCandidates(
    tasks: Task[],
    habits: Habit[],
    now: Date,
    extras: { personalEvents?: PersonalEvent[]; prefs?: Partial<ReminderPrefs> } = {},
): AppNotification[] {
    return deriveReminders(
        { tasks, habits, personalEvents: extras.personalEvents },
        now,
        getUserZone(),
        { time: formatTime, date: formatShortDate },
        extras.prefs,
    ).map((reminder) => ({ ...reminder, read: false }));
}

// ── §11.7: Step 2 — Behavior filtering ──

export interface BehaviorFilterOptions {
    /** User notification preference toggles */
    taskReminders: boolean;
    habitReminders: boolean;
    dueDateAlerts: boolean;
    followUps?: boolean;
    scheduleAlerts?: boolean;
    /** Quiet hours */
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    /** Silent until this instant */
    pausedUntil?: string | null;
    /** Bundle missed habits into a single prompt when > threshold */
    bundleMissedHabits?: boolean;
    missedHabitBundleThreshold?: number;
}

/**
 * Filter candidates based on user behavior preferences, quiet hours, and bundling rules.
 */
export function filterByBehavior(
    candidates: AppNotification[],
    now: Date,
    options: BehaviorFilterOptions,
): AppNotification[] {
    // During quiet hours, suppress all non-high-priority notifications
    const inQuietHours = isPaused(now, options.pausedUntil) || isInQuietHours(
        now,
        getUserZone(),
        options.quietHoursEnabled,
        options.quietHoursStart,
        options.quietHoursEnd,
    );

    let filtered = candidates.filter((n) => {
        if (!reminderKindEnabled(n.kind, options)) return false;
        // During quiet hours, only show high-priority notifications
        if (inQuietHours && n.priority !== "high") return false;
        return true;
    });

    // Bundle missed habit reminders when there are many
    const threshold = options.missedHabitBundleThreshold ?? 3;
    if (options.bundleMissedHabits !== false) {
        const missedHabits = filtered.filter(
            (n) => n.kind === "habit-reminder" && new Date(n.triggerAt).getTime() < now.getTime(),
        );
        if (missedHabits.length >= threshold) {
            // Remove individual missed habits, replace with single bundled notification
            const missedIds = new Set(missedHabits.map((n) => n.id));
            filtered = filtered.filter((n) => !missedIds.has(n.id));
            filtered.push({
                id: `habit-bundle::${todayIn(getUserZone(), now)}`,
                kind: "habit-reminder",
                title: "Routines today",
                body: `${missedHabits.length} routines are open today`,
                triggerAt: now.toISOString(),
                alertAt: null, // ponytail: a bundle never alerts the OS; its routines were already due
                entityId: null,
                route: "/routines",
                priority: "normal",
                read: false,
            });
        }
    }

    return filtered;
}

// ── §11.7: Step 3 — Persistence-aware presentation ──

/**
 * Apply dismissal and deferral state to filter out notifications
 * the user has already acted on. Deferred notifications resurface
 * when their defer-until time has passed.
 */
export function applyPresentationRules(
    candidates: AppNotification[],
    state: NotificationDismissalState,
    now: Date,
): AppNotification[] {
    return candidates.filter((n) => {
        // Skip permanently dismissed
        if (state.dismissedIds.has(n.id)) return false;
        // Skip deferred until their time has come
        const deferUntil = state.deferredUntil.get(n.id);
        if (deferUntil && new Date(deferUntil).getTime() > now.getTime()) return false;
        return true;
    });
}
