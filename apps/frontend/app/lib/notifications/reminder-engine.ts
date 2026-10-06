import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";
import type { AppNotification } from "./notification-model";
import { addDays, atLocal, daysBetween, todayIn, wallTimeOf } from "@cadence/domain/time";
import { formatShortDate, formatTime } from "../utils/date-format";
import { getUserZone } from "../utils/user-zone";
import { routineTimeOn } from "@cadence/domain/repeats";

// ── §11.7: Defer choices ──

export type DeferChoice = "10_minutes" | "this_evening" | "tomorrow";

export const DEFER_LABELS: Record<DeferChoice, string> = {
    "10_minutes": "10 minutes",
    "this_evening": "This evening",
    "tomorrow": "Tomorrow",
};

/** The instant (ISO) a notification should resurface after deferral; "evening" and "tomorrow" are wall times in the user's zone. */
export function computeDeferUntil(choice: DeferChoice, now: Date): string {
    const zone = getUserZone();
    const today = todayIn(zone, now);
    switch (choice) {
        case "10_minutes":
            return new Date(now.getTime() + 10 * 60_000).toISOString();
        case "this_evening": {
            // If already past 7pm, push to tomorrow evening
            const evening = atLocal(today, "19:00", zone);
            return Date.parse(evening) > now.getTime() ? evening : atLocal(addDays(today, 1), "19:00", zone);
        }
        case "tomorrow":
            return atLocal(addDays(today, 1), "09:00", zone);
    }
}

// ── §11.7: Persisted notification state (mirrors notificationState schema) ──

export interface NotificationDismissalState {
    /** Notification ids that have been dismissed this session */
    dismissedIds: Set<string>;
    /** Map of notification id → ISO timestamp when it should resurface */
    deferredUntil: Map<string, string>;
}

// ── §11.7: Quiet hours check ──

/** Handles midnight crossing (e.g. 22:00 → 07:00). */
export function isInQuietHours(
    now: Date,
    enabled: boolean,
    start: string | null,
    end: string | null,
): boolean {
    if (!enabled || !start || !end) return false;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const [ch, cm] = wallTimeOf(now, getUserZone()).split(":").map(Number);
    const current = ch * 60 + cm;
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (startMin <= endMin) {
        return current >= startMin && current < endMin;
    }
    return current >= startMin || current < endMin;
}

// ── §11.7: Step 1 — Pure candidate derivation ──

/**
 * Derive raw notification candidates from current task and habit data.
 * No filtering, no persistence awareness — just raw candidates.
 */
export function deriveCandidates(
    tasks: Task[],
    habits: Habit[],
    now: Date,
): AppNotification[] {
    const items: AppNotification[] = [];
    const zone = getUserZone();
    const today = todayIn(zone, now);

    for (const task of tasks) {
        if (task.state === "COMPLETE" || task.state === "ARCHIVED") continue;

        // Explicit reminder
        if (task.reminderAt && !task.reminderSilenced) {
            const reminderDate = new Date(task.reminderAt);
            const diffMs = reminderDate.getTime() - now.getTime();
            if (diffMs <= 60 * 60_000 && diffMs > -24 * 60 * 60_000) {
                items.push({
                    id: `task-reminder::${task.id}::${task.reminderAt}`,
                    kind: "task-reminder",
                    title: task.title,
                    body: diffMs > 0
                        ? `Reminder at ${formatTime(task.reminderAt)}`
                        : `Reminder was at ${formatTime(task.reminderAt)}`,
                    triggerAt: task.reminderAt,
                    entityId: task.id,
                    route: task.projectId ? `/project/${task.projectId}` : "/",
                    priority: diffMs <= 0 ? "high" : "normal",
                    read: false,
                });
            }
        }

        // Deadlines: a deadline is a day (a LocalDate), never a time.
        if (task.dueDate) {
            const overdueDays = daysBetween(task.dueDate, today);
            if (overdueDays >= 0 && overdueDays <= 3) {
                items.push({
                    id: `task-due::${task.id}::${task.dueDate}`,
                    kind: "task-due",
                    title: task.title,
                    body: overdueDays === 0 ? "Due today" : `Overdue since ${formatShortDate(task.dueDate)}`,
                    triggerAt: atLocal(task.dueDate, "00:00", zone),
                    entityId: task.id,
                    route: task.projectId ? `/project/${task.projectId}` : "/",
                    priority: "high",
                    read: false,
                });
            }
        }
    }

    for (const habit of habits) {
        if (habit.archived || !habit.reminderEnabled) continue;

        const targetTime = routineTimeOn(habit, today);
        if (targetTime) {
            const targetToday = atLocal(today, targetTime, zone);

            const diffMs = Date.parse(targetToday) - now.getTime();
            if (Math.abs(diffMs) <= 2 * 60 * 60_000) {
                // Today's log exists only when the routine is due and not paused;
                // remind while it is still open.
                const openToday = habit.logs?.some(
                    (log) => log.targetDate === today && log.status === "PENDING",
                );

                if (openToday) {
                    items.push({
                        id: `habit-reminder::${habit.id}::${today}`,
                        kind: "habit-reminder",
                        title: habit.title,
                        body: diffMs > 0
                            ? `Due at ${targetTime.slice(0, 5)}`
                            : "Due now",
                        triggerAt: targetToday,
                        entityId: habit.id,
                        route: "/routines",
                        priority: "normal",
                        read: false,
                    });
                }
            }
        }
    }

    return items;
}

// ── §11.7: Step 2 — Behavior filtering ──

export interface BehaviorFilterOptions {
    /** User notification preference toggles */
    taskReminders: boolean;
    habitReminders: boolean;
    dueDateAlerts: boolean;
    /** Quiet hours */
    quietHoursEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
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
    const inQuietHours = isInQuietHours(
        now,
        options.quietHoursEnabled,
        options.quietHoursStart,
        options.quietHoursEnd,
    );

    let filtered = candidates.filter((n) => {
        if (n.kind === "task-reminder" && !options.taskReminders) return false;
        if (n.kind === "task-due" && !options.dueDateAlerts) return false;
        if (n.kind === "habit-reminder" && !options.habitReminders) return false;
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
