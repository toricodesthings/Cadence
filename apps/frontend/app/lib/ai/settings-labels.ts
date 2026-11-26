import {
    Bell,
    BellOff,
    CalendarClock,
    CalendarDays,
    CircleDot,
    EyeOff,
    Filter,
    Flag,
    Flame,
    FolderInput,
    Gauge,
    History,
    Hourglass,
    Layers,
    LayoutList,
    Lightbulb,
    MessageCircle,
    Moon,
    Repeat,
    SlidersHorizontal,
    Smile,
    Sparkles,
    Sunrise,
    Sunset,
    Tag,
    Timer,
    Trash2,
    Type,
    User,
    WandSparkles,
    ArrowDownToLine,
    type LucideIcon,
} from "lucide-react";

export interface SettingLabel {
    label: string;
    icon: LucideIcon;
}

export const SETTING_LABELS: Record<string, SettingLabel> = {
    "tasks.showStreaks": { label: "Routine streaks", icon: Flame },
    "tasks.hideCompleted": { label: "Hide completed tasks", icon: EyeOff },
    "tasks.hideTrash": { label: "Hide trash", icon: Trash2 },
    "tasks.showDoneCelebration": { label: "Completion celebration", icon: Sparkles },
    "tasks.newTaskPlacement": { label: "New task placement", icon: ArrowDownToLine },
    "tasks.defaultView": { label: "Default task view", icon: LayoutList },
    "tasks.defaultDueDate": { label: "Default due date", icon: CalendarClock },
    "tasks.defaultPriority": { label: "Start new tasks at Low priority", icon: Flag },
    "tasks.autoTag": { label: "Tag by list and section", icon: Tag },
    "tasks.intelligence.nlpEnabled": { label: "Smart features", icon: WandSparkles },
    "tasks.intelligence.effortSuggestions": { label: "Suggest Effort", icon: Gauge },
    "tasks.intelligence.smartPlacement": { label: "Suggest with an AI provider", icon: FolderInput },
    "tasks.intelligence.focusViewsEnabled": { label: "Focus Views", icon: Filter },
    "notifications.taskReminders": { label: "Task reminders", icon: Bell },
    "notifications.habitReminders": { label: "Routine reminders", icon: Repeat },
    "notifications.dueDateAlerts": { label: "Due dates", icon: CalendarClock },
    "notifications.quietHoursEnabled": { label: "Quiet hours", icon: Moon },
    "notifications.quietHoursStart": { label: "Quiet hours start", icon: Moon },
    "notifications.quietHoursEnd": { label: "Quiet hours end", icon: Sunrise },
    "notifications.habitReminderLeadMinutes": { label: "Alert before a routine's time", icon: Timer },
    "notifications.followUps": { label: "Waiting follow-ups", icon: Hourglass },
    "notifications.scheduleAlerts": { label: "Timed blocks", icon: CalendarDays },
    "notifications.blockLeadMinutes": { label: "Alert before a timed block", icon: Timer },
    "notifications.fixedLeadMinutes": { label: "Alert before a Fixed block", icon: Timer },
    "notifications.dueHeadsUpDays": { label: "Heads-up before a due date", icon: CalendarClock },
    "notifications.overdueDays": { label: "How long overdue tasks stay listed", icon: Hourglass },
    "notifications.eventDaysBefore": { label: "When to notify for events", icon: CalendarDays },
    "notifications.morningTime": { label: "Morning", icon: Sunrise },
    "notifications.eveningTime": { label: "Evening", icon: Sunset },
    "notifications.pausedUntil": { label: "Pause", icon: BellOff },
    "notifications.showHabitNavDueCount": { label: "Dot on Routines", icon: CircleDot },
    "notifications.bundleMissedRoutinePrompts": { label: "Group several routine reminders", icon: Layers },
    "assistant.persona": { label: "Personality", icon: MessageCircle },
    "assistant.assistantName": { label: "Assistant name", icon: Type },
    "assistant.nickname": { label: "Your nickname", icon: User },
    "assistant.emoji": { label: "Emoji", icon: Smile },
    "assistant.proactiveSuggestions": { label: "Proactive suggestions", icon: Lightbulb },
    "assistant.adaptiveTone": { label: "Adaptive tone", icon: SlidersHorizontal },
    "assistant.resumeLastChat": { label: "Continue last conversation", icon: History },
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
    "tasks.defaultView": { list: "Rows", kanban: "Kanban" },
    "tasks.newTaskPlacement": { top: "Top of list", bottom: "Bottom of list" },
    "tasks.defaultPriority": { low: "On", none: "Off" },
};

export function formatSettingValue(path: string, value: unknown): string {
    const named = VALUE_LABELS[path]?.[String(value)];
    if (named) return named;
    if (value === null || value === undefined) return path === "notifications.pausedUntil" ? "Not paused" : "None";
    if (typeof value === "boolean") return value ? "On" : "Off";
    if (Array.isArray(value))
        return value.length ? value.map((n) => (n === 0 ? "On the day" : `${n}d`)).join(", ") : "None";
    if (typeof value === "number")
        return path.endsWith("Minutes")
            ? value === 0
                ? "At the time"
                : `${value} min`
            : value === 0
              ? "None"
              : `${value} day${value === 1 ? "" : "s"}`;
    if (path === "notifications.pausedUntil" && typeof value === "string") {
        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? value
            : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    }
    if (path.startsWith("assistant.") && ["assistantName", "nickname"].some((k) => path.endsWith(k)))
        return String(value);
    const text = String(value);
    return /^\d{2}:\d{2}$/.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1).replace(/_/g, " ");
}

export function leafPaths(patch: unknown, prefix = ""): { path: string; value: unknown }[] {
    if (typeof patch !== "object" || patch === null || Array.isArray(patch)) return [{ path: prefix, value: patch }];
    return Object.entries(patch).flatMap(([key, value]) => leafPaths(value, prefix ? `${prefix}.${key}` : key));
}

export function readPath(source: unknown, path: string): unknown {
    return path
        .split(".")
        .reduce<unknown>(
            (value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined),
            source,
        );
}
