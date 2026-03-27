import { type ReactNode, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, PanelLeftOpen, CalendarHeart } from "lucide-react";
import {
    Snowflake, CloudSnow, Wind, CloudRain,
    SunDim, Sun, Waves, Flame,
    Leaf, Moon, CloudFog, Gift,
    type LucideIcon,
} from "lucide-react";
import { useRealtimeClock } from "../../hooks/ui/use-realtime-clock";
import { getDateFormatConfig } from "../../lib/utils/date-format";
import * as Popover from "../primitives/Popover";

export type CalendarViewMode = "day" | "week" | "month" | "year";

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

const MONTH_ICONS: LucideIcon[] = [
    Snowflake, CloudSnow, Wind, CloudRain,
    SunDim, Sun, Waves, Flame,
    Leaf, Moon, CloudFog, Gift,
];

const VIEW_LABELS: Record<CalendarViewMode, string> = {
    day: "Day",
    week: "Week",
    month: "Month",
    year: "Year",
};

export interface ScheduleHeaderProps {
    year: number;
    month: number;
    /** Current date string YYYY-MM-DD (drives day label) */
    currentDate: string;
    viewMode: CalendarViewMode;
    onViewMode: (mode: CalendarViewMode) => void;
    onNavigate: (delta: number) => void;
    onToday: () => void;
    /** Opens the event popover for creating a task */
    onAddTask?: () => void;
    /** Opens the schedule dialog on the personal event tab */
    onAddEvent?: () => void;
    /** Overflow content (holiday + clutter controls) */
    overflowContent?: ReactNode;
    /** Sidebar toggle handler for phone layout */
    onToggleSidebar?: () => void;
    compact?: boolean;
}

/** Build the contextual subtitle — week range, day label, or seasonal context. */
function buildSubtitleLabel(
    viewMode: CalendarViewMode,
    currentDate: string,
): string {
    const isDmy = getDateFormatConfig().dateStyle === "dmy";
    const locale = isDmy ? "en-GB" : "en-US";

    if (viewMode === "day") {
        const d = new Date(currentDate + "T00:00:00");
        return d.toLocaleDateString(locale, { weekday: "long", day: "numeric" });
    }
    if (viewMode === "week") {
        const start = new Date(currentDate + "T00:00:00");
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const startLabel = start.toLocaleDateString(locale, { month: "short", day: "numeric" });
        if (start.getMonth() === end.getMonth()) {
            return `Week of ${startLabel} \u2013 ${end.getDate()}, ${end.getFullYear()}`;
        }
        const endLabel = end.toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
        return `Week of ${startLabel} \u2013 ${endLabel}`;
    }
    // Month / year view — return the current day label as warm context
    const d = new Date(currentDate + "T00:00:00");
    return d.toLocaleDateString(locale, { weekday: "long", day: "numeric" });
}

/** Contextual add trigger — one button with task/event segmented chooser. */
function ContextualAddTrigger({
    onAddTask,
    onAddEvent,
}: {
    onAddTask?: () => void;
    onAddEvent?: () => void;
}) {
    const [mode, setMode] = useState<"task" | "event">(onAddTask ? "task" : "event");
    const hasBoth = Boolean(onAddTask) && Boolean(onAddEvent);

    const handleClick = () => {
        if (mode === "task") onAddTask?.();
        else onAddEvent?.();
    };

    if (!hasBoth) {
        // Only one action — render as a single button
        const isTask = Boolean(onAddTask);
        return (
            <button
                type="button"
                onClick={isTask ? onAddTask : onAddEvent}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                    isTask
                        ? "border-accent-primary/20 bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25 hover:border-accent-primary/30"
                        : "border-accent-nav-schedule/20 bg-accent-nav-schedule/12 text-accent-nav-schedule hover:border-accent-nav-schedule/30 hover:bg-accent-nav-schedule/18"
                }`}
            >
                {isTask ? <Plus size={14} /> : <CalendarHeart size={14} />}
                <span className="hidden lg:inline">{isTask ? "Add Task" : "Add Event"}</span>
            </button>
        );
    }

    return (
        <div className="flex items-center gap-0">
            {/* Segmented chooser */}
            <div className="flex items-center rounded-l-xl border border-r-0 border-twilight-border/30 bg-twilight-base/35 p-0.5">
                <button
                    type="button"
                    onClick={() => setMode("task")}
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer border ${
                        mode === "task"
                            ? "bg-accent-primary/20 text-accent-primary border-accent-primary/25"
                            : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"
                    }`}
                >
                    Task
                </button>
                <button
                    type="button"
                    onClick={() => setMode("event")}
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer border ${
                        mode === "event"
                            ? "bg-accent-nav-schedule/18 text-accent-nav-schedule border-accent-nav-schedule/25"
                            : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"
                    }`}
                >
                    Event
                </button>
            </div>
            {/* Primary add button */}
            <button
                type="button"
                onClick={handleClick}
                className={`inline-flex items-center gap-1.5 rounded-r-xl border px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
                    mode === "task"
                        ? "border-accent-primary/20 bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25"
                        : "border-accent-nav-schedule/20 bg-accent-nav-schedule/12 text-accent-nav-schedule hover:bg-accent-nav-schedule/18"
                }`}
                aria-label={mode === "task" ? "Add task" : "Add event"}
            >
                <Plus size={14} />
            </button>
        </div>
    );
}

export function ScheduleHeader({
    year,
    month,
    currentDate,
    viewMode,
    onViewMode,
    onNavigate,
    onToday,
    onAddTask,
    onAddEvent,
    overflowContent,
    onToggleSidebar,
    compact = false,
}: ScheduleHeaderProps) {
    const CurrentIcon = MONTH_ICONS[month];
    const mainHeading = viewMode === "year" ? String(year) : `${MONTHS[month]} ${year}`;
    const subtitleLabel = buildSubtitleLabel(viewMode, currentDate);
    const clock = useRealtimeClock();

    if (compact) {
        // ── Phone: two tight rows ──────────────────────────────────────────
        return (
            <div className="shrink-0 border-b border-twilight-border px-4 pt-2.5 pb-3 sm:px-6 sm:pt-3 sm:pb-3">
                {/* Row 1: sidebar toggle + page identity + heading + nav + overflow + add */}
                <div className="flex items-center gap-2 min-h-[44px]">
                    {onToggleSidebar && (
                        <button
                            type="button"
                            onClick={onToggleSidebar}
                            className="btn-icon rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.05]"
                            aria-label="Open navigation"
                        >
                            <PanelLeftOpen size={18} />
                        </button>
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <CurrentIcon size={14} className="text-accent-primary/70 shrink-0" />
                        <div className="min-w-0">
                            <h2 className="font-display text-sm font-semibold text-twilight-text tracking-tight truncate leading-tight">
                                {mainHeading}
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => onNavigate(-1)}
                            className="btn-icon touch-target rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                            aria-label="Previous"
                        >
                            <ChevronLeft size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate(1)}
                            className="btn-icon touch-target rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                            aria-label="Next"
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                    {overflowContent && (
                        <Popover.Root>
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    className="btn-icon touch-target rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                    aria-label="Display & calendar options"
                                >
                                    <MoreHorizontal size={16} />
                                </button>
                            </Popover.Trigger>
                            <Popover.Content side="bottom" align="end" className="w-80 p-3">
                                {overflowContent}
                            </Popover.Content>
                        </Popover.Root>
                    )}
                    {(onAddTask || onAddEvent) && (
                        <Popover.Root>
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    className="btn-icon touch-target rounded-full text-accent-primary hover:bg-accent-primary/15"
                                    aria-label="Add to schedule"
                                >
                                    <Plus size={16} />
                                </button>
                            </Popover.Trigger>
                            <Popover.Content side="bottom" align="end" className="w-44 p-1.5">
                                {onAddTask && (
                                    <button
                                        type="button"
                                        onClick={onAddTask}
                                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-twilight-text hover:bg-white/[0.06] transition-colors"
                                    >
                                        <Plus size={14} className="text-accent-primary" />
                                        Add task
                                    </button>
                                )}
                                {onAddEvent && (
                                    <button
                                        type="button"
                                        onClick={onAddEvent}
                                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-twilight-text hover:bg-white/[0.06] transition-colors"
                                    >
                                        <CalendarHeart size={14} className="text-accent-nav-schedule" />
                                        Add event
                                    </button>
                                )}
                            </Popover.Content>
                        </Popover.Root>
                    )}
                </div>
                {/* Row 2: view switcher tabs */}
                <div className="flex items-center gap-1 mt-1.5">
                    <nav
                        className="flex items-center gap-1 rounded-xl border border-twilight-border/30 bg-twilight-base/35 p-0.5"
                        aria-label="Calendar view"
                    >
                        {(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => onViewMode(mode)}
                                className={`
                                    rounded-lg px-3 py-1 text-[13px] font-medium transition-colors cursor-pointer border
                                    ${viewMode === mode
                                        ? "bg-accent-primary/20 text-accent-primary border-accent-primary/25"
                                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"}
                                `}
                                aria-current={viewMode === mode ? "true" : undefined}
                            >
                                {VIEW_LABELS[mode]}
                            </button>
                        ))}
                    </nav>
                    <button
                        type="button"
                        onClick={onToday}
                        className="ml-auto rounded-lg border border-twilight-border/30 bg-white/[0.03] px-3 py-1 text-[13px] font-medium text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text cursor-pointer"
                    >
                        Today
                    </button>
                </div>
            </div>
        );
    }

    // ── Desktop: single compressed row ~56px ────────────────────────────────
    return (
        <div className="shrink-0 border-b border-twilight-border px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center gap-3">
                {/* Left: heading block with page identity */}
                <div className="flex min-w-0 items-center gap-2.5">
                    <CurrentIcon size={18} className="text-accent-primary/70 shrink-0" />
                    <div className="min-w-0">
                        <h2 className="font-display text-lg font-semibold text-twilight-text tracking-tight whitespace-nowrap leading-tight">
                            {mainHeading}
                        </h2>
                    </div>
                    <span className="hidden sm:flex items-center text-[13px] text-twilight-text-soft whitespace-nowrap">
                        <span className="mx-1.5 text-twilight-text-soft/50">·</span>
                        <span>{subtitleLabel}</span>
                        <span className="mx-1.5 text-twilight-text-soft/50">·</span>
                        <span className="tabular-nums">{clock}</span>
                    </span>
                </div>

                {/* Center: navigation */}
                <div className="flex items-center gap-1 ml-auto">
                    <button
                        type="button"
                        onClick={() => onNavigate(-1)}
                        className="btn-icon rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                        aria-label="Previous"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <button
                        type="button"
                        onClick={onToday}
                        className="rounded-lg border border-twilight-border/30 bg-white/[0.03] px-3.5 py-1.5 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.05] hover:text-twilight-text transition-colors cursor-pointer"
                    >
                        Today
                    </button>
                    <button
                        type="button"
                        onClick={() => onNavigate(1)}
                        className="btn-icon rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                        aria-label="Next"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Right: view switcher */}
                <nav
                    className="flex items-center gap-0.5 rounded-xl border border-twilight-border/30 bg-twilight-base/35 p-0.5"
                    aria-label="Calendar view"
                >
                    {(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => onViewMode(mode)}
                            className={`
                                rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors cursor-pointer border
                                ${viewMode === mode
                                    ? "bg-accent-primary/20 text-accent-primary border-accent-primary/25"
                                    : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"}
                            `}
                            aria-current={viewMode === mode ? "true" : undefined}
                        >
                            {VIEW_LABELS[mode]}
                        </button>
                    ))}
                </nav>

                {/* Contextual add trigger */}
                {(onAddTask || onAddEvent) && (
                    <ContextualAddTrigger onAddTask={onAddTask} onAddEvent={onAddEvent} />
                )}

                {/* Overflow menu for holiday/clutter controls */}
                {overflowContent && (
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button
                                type="button"
                                className="btn-icon rounded-xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                                aria-label="Display & calendar options"
                            >
                                <MoreHorizontal size={16} />
                            </button>
                        </Popover.Trigger>
                        <Popover.Content side="bottom" align="end" className="w-80 p-3">
                            {overflowContent}
                        </Popover.Content>
                    </Popover.Root>
                )}
            </div>
        </div>
    );
}
