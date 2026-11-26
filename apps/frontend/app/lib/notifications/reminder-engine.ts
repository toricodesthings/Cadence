import type { Task } from "@cadence/contracts/task";
import type { Habit } from "@cadence/contracts/habit";
import type { PersonalEvent } from "@cadence/contracts/personal-event";
import type { AppNotification } from "./notification-model";
import { addDays, atLocal, todayIn } from "@cadence/domain/time";
import { deriveReminders, reminderKindEnabled, type ReminderPrefs } from "@cadence/domain/reminders";
import { formatShortDate, formatTime } from "../utils/date-format";
import { getUserZone } from "../utils/user-zone";

export function deadlineReminderAt(
    task: Pick<Task, "scheduledStart" | "dueDate">,
    morningTime = "09:00",
): string | null {
    return task.scheduledStart ?? (task.dueDate ? atLocal(task.dueDate, morningTime, getUserZone()) : null);
}

export type DeferChoice = "10_minutes" | "this_evening" | "tomorrow";

export const DEFER_LABELS: Record<DeferChoice, string> = {
    "10_minutes": "10 minutes",
    this_evening: "This evening",
    tomorrow: "Tomorrow",
};

export function computeDeferUntil(
    choice: DeferChoice,
    now: Date,
    times: { morningTime?: string; eveningTime?: string } = {},
): string {
    const { morningTime = "09:00", eveningTime = "19:00" } = times;
    const zone = getUserZone();
    const today = todayIn(zone, now);
    switch (choice) {
        case "10_minutes":
            return new Date(now.getTime() + 10 * 60_000).toISOString();
        case "this_evening": {
            const evening = atLocal(today, eveningTime, zone);
            return Date.parse(evening) > now.getTime() ? evening : atLocal(addDays(today, 1), eveningTime, zone);
        }
        case "tomorrow":
            return atLocal(addDays(today, 1), morningTime, zone);
    }
}

export interface NotificationDismissalState {
    dismissedIds: Set<string>;
    deferredUntil: Map<string, string>;
}

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

export interface BehaviorFilterOptions {
    taskReminders: boolean;
    habitReminders: boolean;
    dueDateAlerts: boolean;
    followUps?: boolean;
    scheduleAlerts?: boolean;
    bundleMissedHabits?: boolean;
    missedHabitBundleThreshold?: number;
    hidden?: NotificationDismissalState;
}

export function filterByBehavior(
    candidates: AppNotification[],
    now: Date,
    options: BehaviorFilterOptions,
): AppNotification[] {
    let filtered = candidates.filter((n) => reminderKindEnabled(n.kind, options));
    if (options.hidden) filtered = applyPresentationRules(filtered, options.hidden, now);

    const threshold = options.missedHabitBundleThreshold ?? 3;
    if (options.bundleMissedHabits !== false) {
        const missedHabits = filtered.filter(
            (n) => n.kind === "habit-reminder" && new Date(n.triggerAt).getTime() < now.getTime(),
        );
        if (missedHabits.length >= threshold) {
            const missedIds = new Set(missedHabits.map((n) => n.id));
            filtered = filtered.filter((n) => !missedIds.has(n.id));
            filtered.push({
                id: `habit-bundle::${todayIn(getUserZone(), now)}`,
                kind: "habit-reminder",
                title: "Routines today",
                body: `${missedHabits.length} routines are open today`,
                triggerAt: now.toISOString(),
                alertAt: null,
                entityId: null,
                route: "/routines",
                priority: "normal",
                read: false,
            });
        }
    }

    return filtered;
}

export function applyPresentationRules(
    candidates: AppNotification[],
    state: NotificationDismissalState,
    now: Date,
): AppNotification[] {
    return candidates.filter((n) => {
        if (state.dismissedIds.has(n.id)) return false;
        const deferUntil = state.deferredUntil.get(n.id);
        if (deferUntil && new Date(deferUntil).getTime() > now.getTime()) return false;
        return true;
    });
}
