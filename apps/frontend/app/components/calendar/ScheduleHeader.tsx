import { type ReactNode } from "react";
import { HeaderAddButton } from "../shared/HeaderAddButton";
import { SegmentedControl } from "../primitives/SegmentedControl";
import { ChevronLeft, ChevronRight, EllipsisVertical } from "lucide-react";
import {
    Snowflake,
    CloudSnow,
    Wind,
    CloudRain,
    SunDim,
    Sun,
    Waves,
    Flame,
    Leaf,
    Moon,
    CloudFog,
    Gift,
    type LucideIcon,
} from "lucide-react";
import { addDays, formatInZone, type LocalDate } from "@cadence/domain/time";
import { getDateFormatConfig, getWeekStart, MONTH_NAMES } from "../../lib/utils/date-format";
import { dayOfMonth, parseYMD } from "../../lib/utils/calendar/calendar-math";
import * as Popover from "../primitives/Popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../primitives/Select";
import {
    HEADER_ICON_BUTTON,
    HEADER_SELECT_TRIGGER,
    PAGE_HEADER_SURFACE,
    PageHeader,
    PageHeaderIdentity,
    PhonePageHeader,
} from "../layout/PageHeader";
import { PeriodNav, PeriodTodayButton } from "../layout/PeriodNav";
import { LayoutScaleMenuRow } from "../layout/LayoutScaleMenu";

const SCHEDULE_MENU = "w-72 rounded-xl! p-1!";

export type CalendarViewMode = "day" | "week" | "month" | "year";

const MONTH_ICONS: LucideIcon[] = [
    Snowflake,
    CloudSnow,
    Wind,
    CloudRain,
    SunDim,
    Sun,
    Waves,
    Flame,
    Leaf,
    Moon,
    CloudFog,
    Gift,
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
    currentDate: LocalDate;
    viewMode: CalendarViewMode;
    weekStartsOn: 0 | 1 | 6;
    onViewMode: (mode: CalendarViewMode) => void;
    onNavigate: (delta: number) => void;
    onToday: () => void;
    isCurrentPeriod: boolean;
    onAddTask?: () => void;
    hidePeriodNav?: boolean;
    overflowContent?: ReactNode;
    compact?: boolean;
    phone?: {
        title: string;
        meta?: string | null;
        backLabel?: string | null;
        onZoomOut?: () => void;
    };
}

function buildSubtitleLabel(viewMode: CalendarViewMode, currentDate: LocalDate, weekStartsOn: 0 | 1 | 6): string {
    const isDmy = getDateFormatConfig().dateStyle === "dmy";
    const locale = isDmy ? "en-GB" : "en-US";
    const show = (day: LocalDate, options: Intl.DateTimeFormatOptions) => formatInZone(day, "UTC", options, locale);

    if (viewMode === "week") {
        const start = getWeekStart(currentDate, weekStartsOn);
        const end = addDays(start, 6);
        const startLabel = show(start, { month: "short", day: "numeric" });
        if (parseYMD(start).m === parseYMD(end).m) return `${startLabel} \u2013 ${dayOfMonth(end)}`;
        return `${startLabel} \u2013 ${show(end, { month: "short", day: "numeric" })}`;
    }
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
        return (
            <PhonePageHeader
                pageName="Schedule"
                {...phone}
                options={
                    <div className="space-y-3">
                        {overflowContent}
                        <div className="-mx-2">
                            <LayoutScaleMenuRow panel />
                        </div>
                    </div>
                }
            />
        );
    }

    if (compact) {
        return (
            <header className={`${PAGE_HEADER_SURFACE} safe-header-top px-4 pb-3 sm:px-6`}>
                <div className="flex items-center gap-2 min-h-[44px]">
                    <div className="min-w-0 flex-1">
                        <PageHeaderIdentity
                            compact
                            icon={<CurrentIcon size={16} aria-hidden="true" />}
                            accentColor="var(--accent-nav-schedule, var(--accent-primary))"
                            pageName="Schedule"
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
                            <Popover.Content side="bottom" align="end" className={SCHEDULE_MENU}>
                                {overflowContent}
                                <LayoutScaleMenuRow panel />
                            </Popover.Content>
                        </Popover.Root>
                    )}
                </div>
                <div className="flex items-center gap-1 mt-1.5">
                    <SegmentedControl
                        ariaLabel="Calendar view"
                        size="sm"
                        value={viewMode}
                        onChange={onViewMode}
                        options={(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => ({
                            value: mode,
                            label: VIEW_LABELS[mode],
                        }))}
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
            pageName="Schedule"
            title={mainHeading}
            meta={<span>{subtitleLabel}</span>}
            actions={
                <>
                    {hidePeriodNav ? null : (
                        <PeriodNav
                            unit={VIEW_LABELS[viewMode].toLowerCase()}
                            isCurrent={isCurrentPeriod}
                            onNavigate={onNavigate}
                            onToday={onToday}
                        />
                    )}

                    <Select value={viewMode} onValueChange={(value) => onViewMode(value as CalendarViewMode)}>
                        <SelectTrigger
                            aria-label="Calendar view"
                            className={`${HEADER_SELECT_TRIGGER} focus:ring-accent-nav-schedule/40`}
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent align="end">
                            {(["day", "week", "month", "year"] as CalendarViewMode[]).map((mode) => (
                                <SelectItem key={mode} value={mode}>
                                    {VIEW_LABELS[mode]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {onAddTask ? <HeaderAddButton label="Add" onClick={onAddTask} /> : null}

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
                            <Popover.Content side="bottom" align="end" className={SCHEDULE_MENU}>
                                {overflowContent}
                                <LayoutScaleMenuRow panel />
                            </Popover.Content>
                        </Popover.Root>
                    )}
                </>
            }
        />
    );
}
