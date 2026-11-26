import type { LocalDate } from "@cadence/domain/time";
import { Skeleton, SkeletonLines } from "../primitives/Skeleton";
import { TimeGutter } from "./TimeGutter";
import { useOpenAtHour } from "./TimedCalendarColumn";
import { getDaysInMonth, getFirstDayOfWeek, isoDay, MONTH_NAMES, weekdayLabels } from "../../lib/utils/date-format";
import { dayOfMonth, weekdayName } from "../../lib/utils/calendar/calendar-math";
import { DAY_GRID_HEIGHT, HOUR_HEIGHT } from "../../lib/utils/calendar/calendar-utils";
import { useToday } from "../../lib/utils/user-zone";

const DAYS_FULL = weekdayLabels(3);
const DAYS_SHORT = weekdayLabels(1);
const SHORT_MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));

const WEEK_SKELETON_BLOCKS: Record<number, Array<{ topHour: number; hours: number }>> = {
    0: [{ topHour: 9, hours: 1.5 }],
    1: [
        { topHour: 8.5, hours: 1 },
        { topHour: 13, hours: 2 },
    ],
    2: [{ topHour: 10, hours: 1.5 }],
    3: [
        { topHour: 9, hours: 1 },
        { topHour: 14, hours: 1.5 },
    ],
    4: [{ topHour: 11, hours: 2 }],
    5: [{ topHour: 9.5, hours: 1 }],
    6: [],
};

const DAY_SKELETON_BLOCKS = [
    { topHour: 8.5, hours: 1 },
    { topHour: 10.5, hours: 1.5 },
    { topHour: 13.5, hours: 1.25 },
    { topHour: 16, hours: 1 },
];

function ScheduleRowSkeleton({ width }: { width: string }) {
    return (
        <div className="surface-card flex items-center gap-3 rounded-2xl px-3 py-3">
            <Skeleton className="h-4 w-12 shrink-0 rounded-lg" />
            <SkeletonLines primary={width} secondary="6rem" />
        </div>
    );
}

export function ScheduleMonthSkeleton({ year, month, phone }: { year: number; month: number; phone: boolean }) {
    const today = useToday();
    const total = getDaysInMonth(year, month);
    const first = getFirstDayOfWeek(year, month);
    const cells: (LocalDate | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= total; d++) cells.push(isoDay(year, month, d));

    if (phone) {
        while (cells.length % 7) cells.push(null);
        return (
            <div role="status" aria-label="Loading schedule" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div aria-hidden="true" className="shrink-0 border-b border-twilight-border/40 px-3 pb-3 pt-2">
                    <div className="mb-1 grid grid-cols-7">
                        {DAYS_SHORT.map((d, i) => (
                            <div
                                key={`${d}-${i}`}
                                className="py-1 text-center text-[11px] font-semibold uppercase text-twilight-text-muted"
                            >
                                {d}
                            </div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7 gap-y-1">
                        {cells.map((day, i) => (
                            <div key={day ?? `blank-${i}`} className="flex flex-col items-center gap-1 py-1">
                                {day ? (
                                    <>
                                        <span
                                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums ${
                                                day === today
                                                    ? "bg-accent-primary/20 font-semibold text-accent-primary"
                                                    : "text-twilight-text-soft"
                                            }`}
                                        >
                                            {dayOfMonth(day)}
                                        </span>
                                        {i % 3 === 0 ? (
                                            <Skeleton className="h-1 w-4 rounded-full" />
                                        ) : (
                                            <span className="h-1" />
                                        )}
                                    </>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
                <div aria-hidden="true" className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-28 pt-4">
                    {[0, 1, 2].map((group) => (
                        <div key={group} className="space-y-2">
                            <Skeleton className="h-3.5 w-28 rounded-lg" />
                            <div className="space-y-2">
                                {[0, 1].map((row) => (
                                    <ScheduleRowSkeleton key={row} width={`${55 + ((group + row) % 3) * 14}%`} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div role="status" aria-label="Loading schedule" className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
            <div aria-hidden="true" className="flex h-full flex-col">
                <div className="mb-1 grid shrink-0 grid-cols-7">
                    {DAYS_FULL.map((d) => (
                        <div
                            key={d}
                            className="pb-4 py-1.5 text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-twilight-text-soft"
                        >
                            {d}
                        </div>
                    ))}
                </div>
                <div className="grid flex-1 auto-rows-[1fr] grid-cols-7 gap-1.5">
                    {cells.map((day, i) => (
                        <div
                            key={day ?? `blank-${i}`}
                            className={`flex flex-col gap-1.5 rounded-2xl p-2 ${day ? "surface-card" : "opacity-30"}`}
                        >
                            {day ? (
                                <>
                                    <span
                                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums ${
                                            day === today
                                                ? "bg-accent-primary/20 font-semibold text-accent-primary"
                                                : "text-twilight-text-soft"
                                        }`}
                                    >
                                        {dayOfMonth(day)}
                                    </span>
                                    {i % 2 === 0 ? (
                                        <Skeleton
                                            className="h-4 rounded-md"
                                            style={{ width: `${55 + (i % 3) * 15}%` }}
                                        />
                                    ) : null}
                                    {i % 5 === 1 ? <Skeleton className="h-4 w-3/4 rounded-md" /> : null}
                                </>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function ScheduleWeekSkeleton({ weekDates, startHour = 7 }: { weekDates: LocalDate[]; startHour?: number }) {
    const todayStr = useToday();
    const scrollRef = useOpenAtHour(startHour);

    return (
        <div
            role="status"
            aria-label="Loading week schedule"
            className="surface-card m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] sm:m-3"
        >
            <div aria-hidden="true" className="flex shrink-0">
                <div className="w-14 shrink-0" />
                {weekDates.map((ds) => {
                    const isToday = ds === todayStr;
                    return (
                        <div
                            key={ds}
                            className={`min-w-0 flex-1 border-l border-twilight-border/20 ${isToday ? "calendar-today-column" : ""}`}
                        >
                            <div
                                className={`px-2 py-3 text-center [@media(max-height:760px)]:py-1.5 ${isToday ? "text-accent-primary" : "text-twilight-text-muted"}`}
                            >
                                <div className="flex flex-col items-center [@media(max-height:760px)]:flex-row [@media(max-height:760px)]:justify-center [@media(max-height:760px)]:gap-1.5">
                                    <div className="text-[11px] font-medium uppercase tracking-widest text-twilight-text-muted">
                                        {weekdayName(ds, "short")}
                                    </div>
                                    <div className="mt-0.5 flex items-center justify-center [@media(max-height:760px)]:mt-0">
                                        <div
                                            className={`flex h-8 w-8 items-center justify-center font-display text-lg font-semibold leading-none ${
                                                isToday
                                                    ? "rounded-full bg-accent-primary/20 text-accent-primary ring-1 ring-accent-primary"
                                                    : ""
                                            }`}
                                        >
                                            {dayOfMonth(ds)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div ref={scrollRef} aria-hidden="true" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                <div className="flex" style={{ height: DAY_GRID_HEIGHT }}>
                    <TimeGutter hourHeight={HOUR_HEIGHT} />
                    {weekDates.map((ds, col) => (
                        <div
                            key={ds}
                            className="relative min-w-0 flex-1 border-l border-twilight-border/20"
                            style={{ height: DAY_GRID_HEIGHT }}
                        >
                            {(WEEK_SKELETON_BLOCKS[col] ?? []).map((block, idx) => (
                                <Skeleton
                                    key={idx}
                                    className="absolute inset-x-1.5 rounded-xl"
                                    style={{
                                        top: block.topHour * HOUR_HEIGHT,
                                        height: block.hours * HOUR_HEIGHT - 4,
                                    }}
                                />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export function ScheduleDaySkeleton({ phone, startHour = 7 }: { phone: boolean; startHour?: number }) {
    const scrollRef = useOpenAtHour(startHour);

    if (phone) {
        return (
            <div
                role="status"
                aria-label="Loading day schedule"
                className="min-h-0 flex-1 overflow-y-auto px-3 pb-28 pt-2"
            >
                <div aria-hidden="true" className="space-y-4">
                    {[0, 1].map((section) => (
                        <div key={section} className="space-y-2">
                            <Skeleton className="ml-2 h-3 w-20 rounded-lg" />
                            {[0, 1, 2].map((row) => (
                                <ScheduleRowSkeleton key={row} width={`${52 + ((section + row) % 3) * 15}%`} />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div
            role="status"
            aria-label="Loading day schedule"
            className="surface-card m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] sm:m-3"
        >
            <div
                aria-hidden="true"
                className="flex shrink-0 items-center gap-2 border-b border-twilight-border/20 px-4 py-3"
            >
                <Skeleton className="h-3 w-12 rounded-lg" />
                <Skeleton className="h-6 w-28 rounded-full" />
                <Skeleton className="h-6 w-36 rounded-full" />
            </div>
            <div ref={scrollRef} aria-hidden="true" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                <div className="flex" style={{ height: DAY_GRID_HEIGHT }}>
                    <TimeGutter hourHeight={HOUR_HEIGHT} />
                    <div className="relative min-w-0 flex-1 border-l border-twilight-border/20">
                        {DAY_SKELETON_BLOCKS.map((block, idx) => (
                            <Skeleton
                                key={idx}
                                className="absolute inset-x-3 rounded-xl"
                                style={{
                                    top: block.topHour * HOUR_HEIGHT,
                                    height: block.hours * HOUR_HEIGHT - 4,
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ScheduleYearSkeleton({ compact }: { compact: boolean }) {
    return (
        <div
            role="status"
            aria-label="Loading year schedule"
            className="min-h-0 flex-1 overflow-y-auto p-4 scrollbar-thin"
        >
            <div
                aria-hidden="true"
                className={
                    compact
                        ? "grid grid-cols-2 gap-3 pb-24"
                        : "grid grid-cols-1 gap-4 pb-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                }
            >
                {SHORT_MONTHS.map((label) => (
                    <div key={label} className="surface-card rounded-2xl p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-twilight-text-soft">
                            {label}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {Array.from({ length: 35 }, (_, cell) => (
                                <Skeleton key={cell} className="aspect-square w-full rounded-md" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
