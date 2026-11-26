import { Skeleton } from "../primitives/Skeleton";

const TITLE_WIDTHS = ["66%", "52%", "74%"];

export function ReviewCardsSkeleton({ label = "Loading items", count = 3 }: { label?: string; count?: number }) {
    return (
        <div role="status" aria-label={label} className="flex flex-col gap-3">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} aria-hidden="true" className="surface-card flex flex-col gap-3 rounded-[1.25rem] p-4">
                    <Skeleton className="h-5 rounded-lg" style={{ width: TITLE_WIDTHS[i % TITLE_WIDTHS.length] }} />
                    <div className="flex flex-wrap gap-2">
                        <Skeleton className="h-9 w-20 rounded-xl" />
                        <Skeleton className="h-9 w-24 rounded-xl" />
                        <Skeleton className="h-9 w-20 rounded-xl" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function HabitReviewSkeleton({ count = 3 }: { count?: number }) {
    return (
        <div role="status" aria-label="Loading routines" className="flex flex-col gap-3">
            {Array.from({ length: count }, (_, i) => (
                <div
                    key={i}
                    aria-hidden="true"
                    className="surface-card flex flex-wrap items-center gap-x-6 gap-y-4 rounded-[1.25rem] px-4 py-4 @3xl:flex-nowrap @3xl:py-3"
                >
                    <div className="flex min-w-0 flex-1 basis-full items-center gap-3 @3xl:basis-0">
                        <Skeleton className="size-10 shrink-0 rounded-xl" />
                        <Skeleton className="h-4 rounded-lg" style={{ width: TITLE_WIDTHS[i % TITLE_WIDTHS.length] }} />
                    </div>
                    <div className="grid w-full grid-cols-7 gap-1 @3xl:w-auto @3xl:grid-cols-[repeat(7,2.75rem)] @3xl:gap-1.5">
                        {Array.from({ length: 7 }, (_, day) => (
                            <div key={day} className="flex flex-col items-center gap-1.5">
                                <Skeleton className="h-3 w-3 rounded" />
                                <Skeleton className="size-9 rounded-full" />
                            </div>
                        ))}
                    </div>
                    <Skeleton className="h-9 w-20 rounded-xl" />
                </div>
            ))}
        </div>
    );
}

export function WeekRoomSkeleton() {
    return (
        <div role="status" aria-label="Loading week overview" className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, i) => (
                <div key={i} aria-hidden="true" className="surface-card flex flex-col gap-2.5 rounded-[1.25rem] p-4">
                    <div className="flex items-center justify-between gap-2">
                        <Skeleton className="h-4 w-28 rounded-lg" />
                        <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3.5 rounded-lg" style={{ width: TITLE_WIDTHS[i % TITLE_WIDTHS.length] }} />
                    <Skeleton className="h-3.5 w-2/5 rounded-lg" />
                </div>
            ))}
        </div>
    );
}
