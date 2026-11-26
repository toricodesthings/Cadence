import { Skeleton } from "../primitives/Skeleton";
import { RoutineWeekHeader, weekGridColumns, type RoutineDay } from "./RoutineWeekRow";

const ROW_WIDTHS = ["64%", "48%", "72%", "56%"];
const META_WIDTHS = ["38%", "30%", "44%", "34%"];

function RoutineIdentitySkeleton({ index, className }: { index: number; className?: string }) {
    return (
        <div className={`flex min-w-0 items-center gap-3 ${className ?? ""}`}>
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 rounded-lg" style={{ width: ROW_WIDTHS[index % ROW_WIDTHS.length] }} />
                <Skeleton className="h-3 rounded-lg" style={{ width: META_WIDTHS[index % META_WIDTHS.length] }} />
            </div>
        </div>
    );
}

function TodayBandSkeleton() {
    return (
        <div aria-hidden="true" className="surface-card mb-4 rounded-[37px] px-2 py-2">
            <div className="flex min-h-14 items-center gap-3 px-2">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-16 rounded-lg" />
                    <Skeleton className="h-3 w-40 rounded-lg" />
                </div>
                <Skeleton className="h-8 w-8 shrink-0 rounded-xl" />
            </div>
            <div className="flex flex-col gap-1.5 px-2 pb-1 pt-2">
                {[0, 1].map((i) => (
                    <div key={i} className="flex items-center gap-3 rounded-2xl px-2 py-2">
                        <Skeleton className="size-6 shrink-0 rounded-full" />
                        <Skeleton className="h-4 rounded-lg" style={{ width: ROW_WIDTHS[i] }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function RoutinesWeekSkeleton({
    days,
    today,
    stacked,
    showWeekCount,
    showTodayBand,
}: {
    days: RoutineDay[];
    today: string;
    stacked: boolean;
    showWeekCount: boolean;
    showTodayBand: boolean;
}) {
    return (
        <div
            role="status"
            aria-label="Loading routines"
            className="min-h-0 flex-1 overflow-auto px-4 pb-28 scrollbar-thin sm:px-6"
        >
            {showTodayBand ? <TodayBandSkeleton /> : null}
            {stacked ? (
                <div aria-hidden="true" className="flex flex-col gap-3">
                    {ROW_WIDTHS.map((_, row) => (
                        <div key={row} className="surface-card rounded-[24px] p-4">
                            <RoutineIdentitySkeleton index={row} />
                            <div className="mt-3 grid grid-cols-7 gap-1">
                                {days.map((day) => (
                                    <div key={day.iso} className="flex flex-col items-center gap-1.5">
                                        <span className="text-[11px] font-medium uppercase text-twilight-text-muted">
                                            {day.initial}
                                        </span>
                                        <Skeleton className="size-9 rounded-full" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div aria-hidden="true" className="surface-card min-w-[36rem] rounded-[24px] p-2">
                    <RoutineWeekHeader days={days} today={today} showWeekCount={showWeekCount} />
                    <div className="mt-1 flex flex-col gap-1">
                        {ROW_WIDTHS.map((_, row) => (
                            <div
                                key={row}
                                className={`grid ${weekGridColumns(showWeekCount)} items-center rounded-2xl px-2 py-2.5`}
                            >
                                <RoutineIdentitySkeleton index={row} className="pr-2" />
                                {days.map((day) => (
                                    <div key={day.iso} className="flex items-center justify-center">
                                        <Skeleton className="size-9 rounded-full" />
                                    </div>
                                ))}
                                {showWeekCount ? (
                                    <div className="flex justify-end">
                                        <Skeleton className="h-4 w-8 rounded-lg" />
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function RoutinesMonthSkeleton({ showTodayBand }: { showTodayBand: boolean }) {
    return (
        <div
            role="status"
            aria-label="Loading routines"
            className="min-h-0 flex-1 overflow-auto px-4 pb-28 scrollbar-thin sm:px-6"
        >
            <div style={{ maxWidth: "108rem" }}>
                {showTodayBand ? <TodayBandSkeleton /> : null}
                <div aria-hidden="true" className="grid grid-cols-[repeat(auto-fit,minmax(min(20rem,100%),1fr))] gap-4">
                    {[0, 1, 2].map((card) => (
                        <div key={card} className="surface-card rounded-[1.5rem] p-4 sm:p-5">
                            <RoutineIdentitySkeleton index={card} />
                            <div className="mt-4 grid grid-cols-7 gap-1.5">
                                {Array.from({ length: 35 }, (_, cell) => (
                                    <Skeleton key={cell} className="aspect-square w-full rounded-full" />
                                ))}
                            </div>
                            <Skeleton className="mt-3 h-3 w-36 rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
