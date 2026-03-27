import type { Task } from "../../types/task";
import type { Habit } from "../../types/habit";
import type { AppNotification } from "./notification-model";
import { formatTime, formatShortDate, toISODate } from "../utils/date-format";

// ── §11.7: Defer choices ──

export type DeferChoice = "10_minutes" | "this_evening" | "tomorrow";

export const DEFER_LABELS: Record<DeferChoice, string> = {
    "10_minutes": "10 minutes",
    "this_evening": "This evening",
    "tomorrow": "Tomorrow",
};

/** Compute the ISO timestamp a notification should resurface after deferral */
export function computeDeferUntil(choice: DeferChoice, now: Date): string {
    const d = new Date(now);
    switch (choice) {
        case "10_minutes":
            d.setMinutes(d.getMinutes() + 10);
            return d.toISOString();
        case "this_evening": {
            d.setHours(19, 0, 0, 0);
            // If already past 7pm, push to tomorrow evening
            if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
            return d.toISOString();
        }
        case "tomorrow":
            d.setDate(d.getDate() + 1);
            d.setHours(9, 0, 0, 0);
            return d.toISOString();
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

function isInQuietHours(
    now: Date,
    enabled: boolean,
    start: string | null,
    end: string | null,
): boolean {
    if (!enabled || !start || !end) return false;
    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    const current = now.getHours() * 60 + now.getMinutes();
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

        // Due date notifications
        if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            const todayStr = toISODate(now);
            const dueDateStr = task.dueDate.slice(0, 10);

            if (dueDateStr === todayStr) {
                items.push({
                    id: `task-due::${task.id}::${dueDateStr}`,
                    kind: "task-due",
                    title: task.title,
                    body: task.isAllDay
                        ? "Due today"
                        : `Due at ${formatTime(task.dueDate)}`,
                    triggerAt: task.dueDate,
                    entityId: task.id,
                    route: task.projectId ? `/project/${task.projectId}` : "/",
                    priority: "high",
                    read: false,
                });
            } else if (dueDate < now) {
                const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (24 * 60 * 60_000));
                if (overdueDays <= 3) {
                    items.push({
                        id: `task-due::${task.id}::${dueDateStr}`,
                        kind: "task-due",
                        title: task.title,
                        body: `Overdue since ${formatShortDate(task.dueDate)}`,
                        triggerAt: task.dueDate,
                        entityId: task.id,
                        route: task.projectId ? `/project/${task.projectId}` : "/",
                        priority: "high",
                        read: false,
                    });
                }
            }
        }
    }

    for (const habit of habits) {
        if (habit.archived || !habit.reminderEnabled) continue;

        if (habit.targetTime) {
            const [hours, minutes] = habit.targetTime.split(":").map(Number);
            const targetToday = new Date(now);
            targetToday.setHours(hours, minutes, 0, 0);

            const diffMs = targetToday.getTime() - now.getTime();
            if (Math.abs(diffMs) <= 2 * 60 * 60_000) {
                const todayStr = toISODate(now);
                const completedToday = habit.logs?.some(
                    (log) => log.targetDate.startsWith(todayStr) && log.status === "COMPLETED",
                );

                if (!completedToday) {
                    items.push({
                        id: `habit-reminder::${habit.id}::${todayStr}`,
                        kind: "habit-reminder",
                        title: habit.title,
                        body: diffMs > 0
                            ? `Due at ${habit.targetTime.slice(0, 5)}`
                            : "Due now",
                        triggerAt: targetToday.toISOString(),
                        entityId: habit.id,
                        route: "/habits",
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
                id: `habit-bundle::${toISODate(now)}`,
                kind: "habit-reminder",
                title: "Missed routines",
                body: `${missedHabits.length} habits are waiting for you`,
                triggerAt: now.toISOString(),
                entityId: null,
                route: "/habits",
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

// ── §11.7: Combined pipeline (backward-compatible) ──

/**
 * Full notification pipeline: derive → filter → present → sort.
 * This is the backward-compatible entry point that replaces the old `deriveNotifications`.
 */
export function deriveNotifications(
    tasks: Task[],
    habits: Habit[],
    now: Date,
): AppNotification[] {
    const candidates = deriveCandidates(tasks, habits, now);

    // Sort: high priority first, then by trigger time (most recent first)
    candidates.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
        return new Date(b.triggerAt).getTime() - new Date(a.triggerAt).getTime();
    });

    return candidates;
}
