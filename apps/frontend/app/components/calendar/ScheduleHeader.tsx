import { type ReactNode } from "react";
import { Tip } from "../primitives/Tooltip";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { ChevronLeft, ChevronRight, Plus, EllipsisVertical } from "lucide-react";
import {
    Snowflake, CloudSnow, Wind, CloudRain,
    SunDim, Sun, Waves, Flame,
    Leaf, Moon, CloudFog, Gift,
    type LucideIcon,
} from "lucide-react";
import { addDays, formatInZone, type LocalDate } from "@cadence/domain/time";
import { getDateFormatConfig, getWeekStart, MONTH_NAMES } from "../../lib/utils/date-format";
import { dayOfMonth, parseYMD } from "../../lib/utils/calendar/calendar-math";
import * as Popover from "../primitives/Popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../primitives/Select";
import { HEADER_ICON_BUTTON, HEADER_SELECT_TRIGGER, PAGE_HEADER_SURFACE, PageHeader, PageHeaderIdentity, PhonePageHeader } from "../layout/PageHeader";
import { PeriodNav, PeriodTodayButton } from "../layout/PeriodNav";
import { LayoutScalePanelRow } from "../layout/LayoutScaleMenu";

export type CalendarViewMode = "day" | "week" | "month" | "year";

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
    /** Current LocalDate (drives day label) */
    currentDate: LocalDate;
    viewMode: CalendarViewMode;
    /** The week's first day, from settings, so the range here matches the grid. */
    weekStartsOn: 0 | 1 | 6;
    onViewMode: (mode: CalendarViewMode) => void;
    onNavigate: (delta: number) => void;
    onToday: () => void;
    /** Today is inside the period on screen (greys out Today). */
    isCurrentPeriod: boolean;
    /** Opens the composer on its Task tab; Event is one tab away inside. */
    onAddTask?: () => void;
    /** Laptop moves ‹ Today › to the corner dock, so the header leaves it out. */
    hidePeriodNav?: boolean;
    /** Overflow content (holiday + clutter controls) */
    overflowContent?: ReactNode;
    compact?: boolean;
    /** Phone: the title names what you're looking at, and the label above it zooms out. */
    phone?: {
        title: string;
        /** Quiet line under the title, e.g. "Today · light". */
        meta?: string | null;
        /** Where zooming out goes ("September", "2026"); absent at the top level. */
        backLabel?: string | null;
        onZoomOut?: () => void;
    };
}

/** Build the contextual subtitle — week range, day label, or seasonal context. */
function buildSubtitleLabel(
    viewMode: CalendarViewMode,
    currentDate: LocalDate,
    weekStartsOn: 0 | 1 | 6,
): string {
    const isDmy = getDateFormatConfig().dateStyle === "dmy";
    const locale = isDmy ? "en-GB" : "en-US";
    const show = (day: LocalDate, options: Intl.DateTimeFormatOptions) => formatInZone(day, "UTC", options, locale);

    if (viewMode === "week") {
        // The title already holds the month and year, so the range is just the days.
        const start = getWeekStart(currentDate, weekStartsOn);
        const end = addDays(start, 6);
        const startLabel = show(start, { month: "short", day: "numeric" });
        if (parseYMD(start).m === parseYMD(end).m) return `${startLabel} \u2013 ${dayOfMonth(end)}`;
        return `${startLabel} \u2013 ${show(end, { month: "short", day: "numeric" })}`;
    }
    // Day / month / year view — the current day label as warm context
    return show(currentDate, { weekday: "long", day: "numeric" });
}

export function ScheduleHeader({
    year,
    month,
    currentDate,
    viewMode,
    weekStartsOn,
    onViewMode,
    onNavigate,
    onToday,
    isCurrentPeriod,
    onAddTask,
    hidePeriodNav = false,
    overflowContent,
    compact = false,
    phone,
}: ScheduleHeaderProps) {
    const CurrentIcon = MONTH_ICONS[month];
    const mainHeading = viewMode === "year" ? String(year) : `${MONTH_NAMES[month]} ${year}`;
    const subtitleLabel = buildSubtitleLabel(viewMode, currentDate, weekStartsOn);

    if (phone) {
        // Phone: one row. Period changes are swipes and taps on the calendar
        // itself; the label above the title zooms out (Day → Month → Year).
        return <PhonePageHeader eyebrow="Schedule" {...phone} options={<div className="space-y-4">{overflowContent}<LayoutScalePanelRow /></div>} />;
    }

    if (compact) {
        // ── Phone: two tight rows ──────────────────────────────────────────
        return (
            <header className={`${PAGE_HEADER_SURFACE} safe-header-top px-4 pb-3 sm:px-6`}>
                {/* Row 1: page identity + heading + nav + overflow. Browse is a
                    dock tab now, and creation lives in the floating orb. */}
                <div className="flex items-center gap-2 min-h-[44px]">
                    <div className="min-w-0 flex-1">
                        <PageHeaderIdentity
                            compact
                            icon={<CurrentIcon size={16} aria-hidden="true" />}
                            accentColor="var(--accent-nav-schedule, var(--accent-primary))"
                            eyebrow="Schedule"
                            title={mainHeading}
                        />
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
                                    <EllipsisVertical size={18} aria-hidden="true" />
                                </button>
                            </Popover.Trigger>
                            <Popover.Content side="bottom" align="end" className="w-80 p-3">
                                <div className="space-y-4">{overflowContent}<LayoutScalePanelRow /></div>
                            </Popover.Content>
                        </Popover.Root>
                    )}
                </div>
                {/* Row 2: view switcher tabs */}
                <div className="flex items-center gap-1 mt-1.5">
                    <SegmentedControl
                        ariaLabel="Calendar view"
                        size="sm"
                        value={viewMode}
                        onChange={onViewMode}
                        options={(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => ({ value: mode, label: VIEW_LABELS[mode] }))}
                    />
                    <PeriodTodayButton compact isCurrent={isCurrentPeriod} onToday={onToday} />
                </div>
            </header>
        );
    }

    return (
        <PageHeader
            icon={<CurrentIcon size={18} aria-hidden="true" />}
            accentColor="var(--accent-nav-schedule, var(--accent-primary))"
            eyebrow="Schedule"
            title={mainHeading}
            meta={<span>{subtitleLabel}</span>}
            actions={<>
                {hidePeriodNav ? null : <PeriodNav unit={VIEW_LABELS[viewMode].toLowerCase()} isCurrent={isCurrentPeriod} onNavigate={onNavigate} onToday={onToday} />}

                {/* Right: view switcher */}
                <Select value={viewMode} onValueChange={(value) => onViewMode(value as CalendarViewMode)}>
                    <SelectTrigger
                        aria-label="Calendar view"
                        className={`${HEADER_SELECT_TRIGGER} focus:ring-accent-nav-schedule/40`}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                        {(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => (
                            <SelectItem key={mode} value={mode}>{VIEW_LABELS[mode]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* One Add: the composer opens on Task, Event is its second tab */}
                {onAddTask ? (
                    <Tip label="Add to schedule" side="bottom">
                        <button
                            type="button"
                            onClick={onAddTask}
                            aria-label="Add to schedule"
                            className="surface-control-accent inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border border-accent-primary/20 px-3.5 text-sm font-medium text-accent-primary transition-colors hover:border-accent-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            <Plus size={14} aria-hidden="true" />
                            <span className="hidden lg:inline">Add</span>
                        </button>
                    </Tip>
                ) : null}

                {/* Overflow menu for holiday/clutter controls */}
                {overflowContent && (
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button
                                type="button"
                                className={HEADER_ICON_BUTTON}
                                aria-label="Display & calendar options"
                            >
                                <EllipsisVertical size={18} aria-hidden="true" />
                            </button>
                        </Popover.Trigger>
                        <Popover.Content side="bottom" align="end" className="w-80 p-3">
                            <div className="space-y-4">{overflowContent}<LayoutScalePanelRow /></div>
                        </Popover.Content>
                    </Popover.Root>
                )}
            </>}
        />
    );
}
