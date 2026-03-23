import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus, MoreHorizontal, PanelLeftOpen } from "lucide-react";
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
                        <CurrentIcon size={14} className="text-lantern/70 shrink-0" />
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted leading-none">Schedule</p>
                            <h2 className="font-display text-sm font-semibold text-twilight-text tracking-tight truncate leading-tight">
                                {mainHeading}
                            </h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => onNavigate(-1)}
                            className="btn-icon min-h-8 min-w-8 rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                            aria-label="Previous"
                        >
                            <ChevronLeft size={15} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate(1)}
                            className="btn-icon min-h-8 min-w-8 rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
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
                                    className="btn-icon min-h-8 min-w-8 rounded-full text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
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
                    {onAddTask && (
                        <button
                            type="button"
                            onClick={onAddTask}
                            onContextMenu={(event) => {
                                if (!onAddEvent) return;
                                event.preventDefault();
                                onAddEvent();
                            }}
                            className="btn-icon min-h-8 min-w-8 rounded-full text-lantern hover:bg-lantern/15"
                            aria-label="Add task"
                            title={onAddEvent ? "Right-click to add an event" : undefined}
                        >
                            <Plus size={16} />
                        </button>
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
                                        ? "bg-lantern/20 text-lantern border-lantern/25"
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
                    <CurrentIcon size={18} className="text-lantern/70 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted leading-none">Schedule</p>
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
                                    ? "bg-lantern/20 text-lantern border-lantern/25"
                                    : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] border-transparent"}
                            `}
                            aria-current={viewMode === mode ? "true" : undefined}
                        >
                            {VIEW_LABELS[mode]}
                        </button>
                    ))}
                </nav>

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

                {/* Add task button */}
                {onAddTask && (
                    <button
                        type="button"
                        onClick={onAddTask}
                        onContextMenu={(event) => {
                            if (!onAddEvent) return;
                            event.preventDefault();
                            onAddEvent();
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-lantern/20 bg-lantern/15 px-4 py-1.5 text-sm font-medium text-lantern hover:bg-lantern/25 hover:border-lantern/30 transition-colors cursor-pointer"
                        title={onAddEvent ? "Right-click to add an event" : undefined}
                    >
                        <Plus size={14} />
                        <span className="hidden lg:inline">Add Task</span>
                    </button>
                )}
            </div>
        </div>
    );
}
