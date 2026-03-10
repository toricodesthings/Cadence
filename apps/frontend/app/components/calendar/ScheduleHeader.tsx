import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
    Snowflake, CloudSnow, Wind, CloudRain,
    SunDim, Sun, Waves, Flame,
    Leaf, Moon, CloudFog, Gift,
    type LucideIcon,
} from "lucide-react";
import { useRealtimeClock } from "../../hooks/use-realtime-clock";

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
    compact?: boolean;
}

/** Build the contextual subtitle — week range, day label, or seasonal context. */
function buildSubtitleLabel(
    viewMode: CalendarViewMode,
    currentDate: string,
): string {
    if (viewMode === "day") {
        const d = new Date(currentDate + "T00:00:00");
        return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric" });
    }
    if (viewMode === "week") {
        const start = new Date(currentDate + "T00:00:00");
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (start.getMonth() === end.getMonth()) {
            return `Week of ${startLabel} \u2013 ${end.getDate()}, ${end.getFullYear()}`;
        }
        const endLabel = end.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
        return `Week of ${startLabel} \u2013 ${endLabel}`;
    }
    // Month / year view — return the current day label as warm context
    const d = new Date(currentDate + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric" });
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
    compact = false,
}: ScheduleHeaderProps) {
    const CurrentIcon = MONTH_ICONS[month];
    // Line 1: "February 2026" or "2026"
    const mainHeading = viewMode === "year" ? String(year) : `${MONTHS[month]} ${year}`;
    // Line 2: contextual warm label
    const subtitleLabel = buildSubtitleLabel(viewMode, currentDate);
    const clock = useRealtimeClock();

    return (
        <div className="shrink-0 border-b border-twilight-border px-4 py-4 sm:px-6 lg:px-8">
            {/* ── Row 1: Heading + nav controls ── */}
            <div className={`flex gap-4 ${compact ? "flex-col" : "items-start justify-between"}`}>
                {/* Left: two-line heading block */}
                <div>
                    <div className="flex items-center gap-2.5">
                        <CurrentIcon size={20} className="text-lantern/70 shrink-0" />
                        <h2 className="font-display text-2xl font-semibold text-twilight-text tracking-tight leading-tight sm:text-[2rem]">
                            {mainHeading}
                        </h2>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center pl-[30px] text-[14px] text-twilight-text-soft">
                        <span>{subtitleLabel}</span>
                        <span className="mx-1.5 text-twilight-text-soft">·</span>
                        <span className="tabular-nums">{clock}</span>
                    </p>
                </div>

                {/* Right: Today + Prev/Next */}
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                        type="button"
                        onClick={onToday}
                        className="touch-target rounded-2xl border border-twilight-border px-4 text-[14px] font-medium text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] transition-colors duration-200 cursor-pointer"
                    >
                        Today
                    </button>

                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => onNavigate(-1)}
                            className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                            aria-label="Previous"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate(1)}
                            className="btn-icon rounded-2xl text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                            aria-label="Next"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Row 2: View switcher (left) + Add Task CTA (right) ── */}
            <div className={`mt-4 flex gap-3 ${compact ? "flex-col" : "items-center justify-between"}`}>
                <nav
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-twilight-border bg-twilight-base/35 p-1"
                    aria-label="Calendar view"
                >
                    {(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => onViewMode(mode)}
                            className={`
                                touch-target rounded-xl px-4 text-[14px] font-medium transition-colors duration-200 cursor-pointer
                                ${viewMode === mode
                                    ? "bg-lantern/20 text-lantern border border-lantern/25"
                                    : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04]"}
                            `}
                            aria-current={viewMode === mode ? "true" : undefined}
                        >
                            {VIEW_LABELS[mode]}
                        </button>
                    ))}
                </nav>

                {onAddTask && (
                    <button
                        type="button"
                        onClick={onAddTask}
                        className="touch-target inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-lantern/20 bg-lantern/15 px-4 text-[14px] font-medium text-lantern hover:bg-lantern/25 hover:border-lantern/30 transition-colors duration-200 cursor-pointer"
                    >
                        <Plus size={15} />
                        Add Task
                    </button>
                )}
            </div>
        </div>
    );
}
