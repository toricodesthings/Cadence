import type { Task } from "../../types/task";
import type { Habit } from "../../types/habit";
import type { AppNotification } from "./notification-model";
import { formatTime, formatShortDate, toISODate } from "../utils/date-format";

/**
 * Derive in-app notifications from current task and habit data.
 * All logic is pure — no side effects, no subscriptions.
 */
export function deriveNotifications(
    tasks: Task[],
    habits: Habit[],
    now: Date,
): AppNotification[] {
    const items: AppNotification[] = [];

    // ── Task reminder notifications ──
    for (const task of tasks) {
        if (task.state === "COMPLETE" || task.state === "ARCHIVED") continue;

        // Explicit reminder
        if (task.reminderAt && !task.reminderSilenced) {
            const reminderDate = new Date(task.reminderAt);
            // Show reminders that have fired (past) or are coming within the next hour
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

        // Due date notifications (all-day or timed)
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
                // Overdue — show for up to 3 days
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

    // ── Habit reminder notifications ──
    for (const habit of habits) {
        if (habit.archived || !habit.reminderEnabled) continue;

        if (habit.targetTime) {
            // targetTime is "HH:MM" or "HH:MM:SS"
            const [hours, minutes] = habit.targetTime.split(":").map(Number);
            const targetToday = new Date(now);
            targetToday.setHours(hours, minutes, 0, 0);

            const diffMs = targetToday.getTime() - now.getTime();
            // Show if within ±2 hours
            if (Math.abs(diffMs) <= 2 * 60 * 60_000) {
                const todayStr = toISODate(now);

                // Check if already completed today
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

    // Sort: high priority first, then by trigger time (most recent first)
    items.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
        return new Date(b.triggerAt).getTime() - new Date(a.triggerAt).getTime();
    });

    return items;
}
