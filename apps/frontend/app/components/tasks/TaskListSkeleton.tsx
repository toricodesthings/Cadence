import { Skeleton } from "../primitives/Skeleton";

/** Pulse-animated skeleton placeholder — shown only on cold cache (first load) */
export function TaskListSkeleton() {
    return (
        <div className="flex flex-col gap-0 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-start gap-4 px-5 py-5 rounded-2xl"
                >
                    {/* Drag handle placeholder */}
                    <Skeleton className="w-4 h-4 rounded-full bg-white/[0.04] shrink-0 mt-0.5" />
                    {/* Checkbox placeholder */}
                    <Skeleton className="w-5 h-5 rounded-full shrink-0 mt-0.5" />
                    {/* Content placeholder */}
                    <div className="flex-1 flex flex-col gap-2 pt-0.5">
                        <Skeleton
                            className="h-4 rounded-lg"
                            style={{ width: `${60 + (i % 3) * 15}%` }}
                        />
                        {i % 2 === 0 && (
                            <Skeleton className="h-3 w-24 rounded-lg bg-white/[0.04]" />
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
