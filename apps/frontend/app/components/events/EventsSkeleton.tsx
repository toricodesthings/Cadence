import { Skeleton } from "../primitives/Skeleton";
import { EVENT_LIST_COLUMNS, EventListHeader } from "./EventList";
import type { PersonalEventView } from "../../lib/utils/personal-events";

const LABEL_WIDTHS = ["62%", "48%", "74%", "54%", "68%", "52%"];

export function EventsSkeleton({ view, stacked }: { view: PersonalEventView; stacked: boolean }) {
    if (view === "list") {
        return (
            <section role="status" aria-label="Loading events" className="pb-8">
                <div aria-hidden="true" className="surface-card rounded-[24px] p-2">
                    {stacked ? null : <EventListHeader />}
                    <div className="flex flex-col gap-1 pt-1">
                        {LABEL_WIDTHS.slice(0, 5).map((width, i) =>
                            stacked ? (
                                <div key={i} className="flex items-center gap-3 rounded-2xl px-3 py-3">
                                    <Skeleton className="h-10 w-10 shrink-0 rounded-[10px]" />
                                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                        <Skeleton className="h-4 rounded-lg" style={{ width }} />
                                        <Skeleton className="h-3 w-28 rounded-lg" />
                                    </div>
                                    <Skeleton className="h-7 w-16 shrink-0 rounded-full" />
                                </div>
                            ) : (
                                <div key={i} className={`${EVENT_LIST_COLUMNS} rounded-2xl px-3 py-2.5`}>
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Skeleton className="h-9 w-9 shrink-0 rounded-[10px]" />
                                        <Skeleton className="h-4 rounded-lg" style={{ width }} />
                                    </div>
                                    <Skeleton className="h-4 w-20 rounded-lg" />
                                    <Skeleton className="h-7 w-24 rounded-full" />
                                    <div className="flex justify-center">
                                        <Skeleton className="size-8 rounded-xl" />
                                    </div>
                                    <div className="flex justify-center">
                                        <Skeleton className="size-8 rounded-xl" />
                                    </div>
                                </div>
                            ),
                        )}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section role="status" aria-label="Loading events" className="grid gap-4 pb-8 sm:grid-cols-2 xl:grid-cols-3">
            {LABEL_WIDTHS.map((width, i) => (
                <div key={i} aria-hidden="true" className="surface-card rounded-[1.7rem] p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <Skeleton className="h-12 w-12 shrink-0 rounded-[10px]" />
                            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                                <Skeleton className="h-4 rounded-lg" style={{ width }} />
                                <Skeleton className="h-3 w-20 rounded-lg" />
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <Skeleton className="h-9 w-9 rounded-xl" />
                            <Skeleton className="h-9 w-9 rounded-xl" />
                        </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between gap-2">
                        <Skeleton className="h-4 w-24 rounded-lg" />
                        <Skeleton className="h-7 w-24 rounded-full" />
                    </div>
                </div>
            ))}
        </section>
    );
}
