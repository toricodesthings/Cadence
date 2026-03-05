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
        const endLabel = end.toLocaleDateString("en-US", {
            month: start.getMonth() === end.getMonth() ? undefined : "short",
            day: "numeric",
        });
        return `${startLabel}\u2013${endLabel}`;
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
}: ScheduleHeaderProps) {
    const CurrentIcon = MONTH_ICONS[month];
    // Line 1: "February 2026" or "2026"
    const mainHeading = viewMode === "year" ? String(year) : `${MONTHS[month]} ${year}`;
    // Line 2: contextual warm label
    const subtitleLabel = buildSubtitleLabel(viewMode, currentDate);
    const clock = useRealtimeClock();

    return (
        <div className="shrink-0 px-8 py-5 border-b border-twilight-border">
            {/* ── Row 1: Heading + nav controls ── */}
            <div className="flex items-start justify-between">
                {/* Left: two-line heading block */}
                <div>
                    <div className="flex items-center gap-2.5">
                        <CurrentIcon size={20} className="text-lantern/70 shrink-0" />
                        <h2 className="font-display text-2xl font-semibold text-twilight-text tracking-tight leading-tight">
                            {mainHeading}
                        </h2>
                    </div>
                    <p className="mt-0.5 text-[13px] text-twilight-text-muted pl-[30px] flex items-center">
                        <span>{subtitleLabel}</span>
                        <span className="mx-1.5 text-twilight-text-muted/60">·</span>
                        <span className="tabular-nums">{clock}</span>
                    </p>
                </div>

                {/* Right: Today + Prev/Next */}
                <div className="flex items-center gap-2 pt-0.5">
                    <button
                        type="button"
                        onClick={onToday}
                        className="px-4 py-2 rounded-xl border border-twilight-border text-[13px] font-medium text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.04] transition-colors duration-200 cursor-pointer"
                    >
                        Today
                    </button>

                    <div className="flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => onNavigate(-1)}
                            className="btn-icon text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                            aria-label="Previous"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onNavigate(1)}
                            className="btn-icon text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                            aria-label="Next"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Row 2: View switcher (left) + Add Task CTA (right) ── */}
            <div className="flex items-center justify-between mt-3">
                <nav
                    className="flex items-center glass rounded-xl p-[3px] gap-[2px]"
                    aria-label="Calendar view"
                >
                    {(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => onViewMode(mode)}
                            className={`
                                px-4 py-2 rounded-lg text-[13px] font-medium transition-colors duration-200 cursor-pointer
                                ${viewMode === mode
                                    ? "bg-lantern/20 text-lantern border border-lantern/25"
                                    : "text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04]"}
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
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lantern/15 text-lantern border border-lantern/20 text-[13px] font-medium hover:bg-lantern/25 hover:border-lantern/30 transition-colors duration-200 cursor-pointer"
                    >
                        <Plus size={15} />
                        Add Task
                    </button>
                )}
            </div>
        </div>
    );
}
