import { Skeleton, SkeletonLines } from "../primitives/Skeleton";

function DetailAccordionSkeleton({ titleWidth, summaryWidth }: { titleWidth: string; summaryWidth: string }) {
    return (
        <div className="surface-card flex items-center gap-3 rounded-2xl px-4 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-xl" />
            <SkeletonLines primary={titleWidth} secondary={summaryWidth} />
            <Skeleton className="size-4 shrink-0 rounded" />
        </div>
    );
}

export function TaskNoteSkeleton() {
    return (
        <div role="status" aria-label="Loading notes" className="flex flex-col gap-3">
            <div aria-hidden="true" className="flex min-h-[11rem] flex-col justify-between px-1 py-2">
                <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-11/12 rounded-lg" />
                    <Skeleton className="h-4 w-2/3 rounded-lg" />
                </div>
                <Skeleton className="ml-auto h-3 w-12 rounded-lg" />
            </div>
            <Skeleton aria-hidden="true" className="h-11 w-full rounded-2xl" />
        </div>
    );
}

export function DetailPanelSkeleton({ kind = "task" }: { kind?: "capture" | "task" | "habit" | "event" }) {
    return (
        <div
            role="status"
            aria-label={`Loading ${kind} details`}
            className="flex h-full min-w-0 flex-col overflow-hidden"
        >
            <div
                aria-hidden="true"
                className="flex h-(--shell-header-h) shrink-0 items-center justify-between gap-3 border-b border-twilight-border px-5"
            >
                <div className="flex min-w-0 items-center gap-3">
                    <Skeleton className="size-6 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-20 rounded-lg" />
                </div>
                <Skeleton className="size-7 shrink-0 rounded-lg" />
            </div>
            <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-5">
                <div className="surface-card flex flex-col gap-2 rounded-2xl p-4">
                    <Skeleton className="h-2.5 w-10 rounded" />
                    <Skeleton className="h-5 w-4/5 rounded-lg" />
                    <Skeleton className="h-5 w-3/5 rounded-lg" />
                </div>
                {kind === "task" ? (
                    <>
                        <TaskNoteSkeleton />
                        <DetailAccordionSkeleton titleWidth="24%" summaryWidth="72%" />
                        <DetailAccordionSkeleton titleWidth="30%" summaryWidth="64%" />
                        <DetailAccordionSkeleton titleWidth="34%" summaryWidth="48%" />
                    </>
                ) : (
                    <>
                        <DetailAccordionSkeleton titleWidth="32%" summaryWidth="66%" />
                        <DetailAccordionSkeleton titleWidth="28%" summaryWidth="58%" />
                        <DetailAccordionSkeleton titleWidth="36%" summaryWidth="52%" />
                    </>
                )}
            </div>
        </div>
    );
}

export function AssistantMessagesSkeleton() {
    return (
        <>
            <div className="flex items-start gap-2.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                    <Skeleton className="h-3 w-[85%] rounded-full" />
                    <Skeleton className="h-3 w-[70%] rounded-full" />
                    <Skeleton className="h-3 w-[45%] rounded-full" />
                </div>
            </div>
            <Skeleton className="ml-auto h-10 w-[55%] rounded-[20px] rounded-br-md" />
            <div className="flex items-start gap-2.5">
                <Skeleton className="size-7 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-2 pt-1">
                    <Skeleton className="h-3 w-[78%] rounded-full" />
                    <Skeleton className="h-3 w-[60%] rounded-full" />
                </div>
            </div>
        </>
    );
}

export function AssistantPanelSkeleton({ width }: { width?: number }) {
    return (
        <div
            role="status"
            aria-label="Loading assistant"
            style={width ? { width } : undefined}
            className={`surface-shell flex h-full shrink-0 flex-col overflow-hidden ${width ? "photo-shell-surface" : "w-full"}`}
        >
            <div
                aria-hidden="true"
                className="flex h-(--shell-header-h) shrink-0 items-center justify-between gap-2 border-b border-twilight-border px-3"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <Skeleton className="size-9 shrink-0 rounded-xl" />
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex flex-col gap-1.5">
                        <Skeleton className="h-4 w-20 rounded-lg" />
                        <Skeleton className="h-3 w-16 rounded-lg" />
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <Skeleton className="size-9 rounded-xl" />
                    <Skeleton className="size-9 rounded-xl" />
                </div>
            </div>
            <div aria-hidden="true" className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden px-4 py-5">
                <AssistantMessagesSkeleton />
            </div>
            <div aria-hidden="true" className="shrink-0 px-3 pb-3 pt-1">
                <div className="surface-card flex flex-col gap-3 rounded-[24px] p-3">
                    <Skeleton className="h-4 w-44 rounded-lg" />
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                            <Skeleton className="size-8 rounded-xl" />
                            <Skeleton className="size-8 rounded-xl" />
                        </div>
                        <Skeleton className="size-8 rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
}
