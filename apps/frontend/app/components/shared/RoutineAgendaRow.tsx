import { useState } from "react";
import { Clock3, Repeat } from "lucide-react";
import { AgendaRow } from "./AgendaRow";

/**
 * A pending routine inside an agenda list. Today and Upcoming render the same
 * row so a routine reads identically wherever it surfaces; each route only
 * supplies how completion is persisted.
 */
export function RoutineAgendaRow({
    title,
    metaLabel,
    timeLabel = null,
    overdue = false,
    onOpen,
    onComplete,
}: {
    title: string;
    /** The date line, e.g. "Today" or "From Sep 18". */
    metaLabel: string;
    timeLabel?: string | null;
    overdue?: boolean;
    onOpen: () => void;
    onComplete: () => void | Promise<unknown>;
}) {
    const [isResolving, setIsResolving] = useState(false);

    const handleResolve = async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (isResolving) return;
        setIsResolving(true);
        try {
            await onComplete();
        } finally {
            setIsResolving(false);
        }
    };

    return (
        <AgendaRow
            leading={(
                <button
                    type="button"
                    onClick={handleResolve}
                    data-no-dnd="true"
                    disabled={isResolving}
                    aria-label={isResolving ? "Completing routine" : "Mark routine complete"}
                    className="group relative mt-0.5 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 disabled:cursor-wait lg:h-8 lg:w-8"
                >
                    <span
                        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,color] duration-200 lg:h-6 lg:w-6 ${
                            isResolving
                                ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary"
                                : "border-moonlit/45 text-moonlit/80 group-hover:border-moonlit/70 group-hover:text-moonlit"
                        }`}
                    >
                        {isResolving ? (
                            <Clock3 className="h-3 w-3 animate-pulse" />
                        ) : (
                            <span className="relative flex h-3.5 w-3.5 items-center justify-center" aria-hidden="true">
                                <span className="h-2 w-2 rounded-full bg-moonlit/80" />
                            </span>
                        )}
                    </span>
                </button>
            )}
            onOpen={onOpen}
            ariaLabel={`Open habits for ${title}`}
            className={overdue ? "bg-moonlit/[0.05] hover:bg-moonlit/[0.07]" : "bg-moonlit/[0.035] hover:bg-moonlit/[0.06]"}
        >
            <div className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-moonlit/90">
                <Repeat size={11} aria-hidden="true" />
                <span>{overdue ? "Catch-up" : "Routine"}</span>
            </div>

            <div className="min-w-0 truncate text-[15px] font-medium leading-snug text-twilight-text sm:text-[15.5px]">
                {title}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-twilight-text-soft">
                <span className="inline-flex items-center gap-1.5 font-medium text-moonlit">
                    <Repeat size={12} aria-hidden="true" />
                    {metaLabel}
                </span>

                {timeLabel ? (
                    <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={12} aria-hidden="true" />
                        {timeLabel}
                    </span>
                ) : null}
            </div>
        </AgendaRow>
    );
}
