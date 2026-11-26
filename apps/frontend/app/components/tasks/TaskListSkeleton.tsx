import { Skeleton } from "../primitives/Skeleton";

export function TaskListSkeleton() {
    return (
        <div role="status" aria-label="Loading tasks" className="mt-4 flex flex-col gap-0">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} aria-hidden="true" className="flex items-start gap-4 rounded-2xl px-5 py-5">
                    <Skeleton className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-white/[0.04]" />
                    <Skeleton className="mt-0.5 h-5 w-5 shrink-0 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2 pt-0.5">
                        <Skeleton className="h-4 rounded-lg" style={{ width: `${60 + (i % 3) * 15}%` }} />
                        {i % 2 === 0 && <Skeleton className="h-3 w-24 rounded-lg bg-white/[0.04]" />}
                    </div>
                </div>
            ))}
        </div>
    );
}

export function BoardSkeleton({ columns = 3 }: { columns?: number }) {
    return (
        <div
            role="status"
            aria-label="Loading board"
            className="flex min-h-0 flex-1 gap-4 overflow-hidden px-4 pb-6 pt-2 sm:px-6"
        >
            {Array.from({ length: columns }, (_, col) => (
                <div
                    key={col}
                    aria-hidden="true"
                    className="surface-card flex h-full min-h-[20rem] min-w-[min(clamp(24rem,30vw,30rem),78vw)] flex-1 flex-col rounded-[28px] p-4"
                >
                    <div className="flex items-center gap-2 pb-4">
                        <Skeleton className="size-5 rounded-md" />
                        <Skeleton className="h-5 w-28 rounded-lg" />
                        <Skeleton className="h-5 w-7 rounded-full" />
                    </div>
                    <div className="flex flex-col gap-3">
                        {Array.from({ length: 3 - (col % 2) }, (_, row) => (
                            <div key={row} className="surface-item flex items-start gap-3 rounded-2xl p-4">
                                <Skeleton className="mt-0.5 size-5 shrink-0 rounded-full" />
                                <div className="flex flex-1 flex-col gap-2">
                                    <Skeleton
                                        className="h-4 rounded-lg"
                                        style={{ width: `${58 + ((col + row) % 3) * 14}%` }}
                                    />
                                    <Skeleton className="h-3 w-20 rounded-lg" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
