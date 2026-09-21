import { useState } from "react";
import { Check, Clock3 } from "lucide-react";
import { AgendaRow } from "./AgendaRow";
import { RoutineMark } from "../habits/RoutineMark";

/**
 * One routine in an agenda: its mark, its title, and a time only when it has
 * one. The surrounding section already says "routine" and which day it is, so
 * the row doesn't repeat either. Today's tray and Upcoming share it.
 */
export function RoutineAgendaRow({
    title,
    emoji = null,
    timeLabel = null,
    dateLabel = null,
    done = false,
    onOpen,
    onComplete,
}: {
    title: string;
    emoji?: string | null;
    timeLabel?: string | null;
    /** Only for lists that span several days, e.g. "Sep 23". */
    dateLabel?: string | null;
    done?: boolean;
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

    const meta = [dateLabel, timeLabel].filter(Boolean).join(" · ");

    return (
        <AgendaRow
            leading={(
                <button
                    type="button"
                    onClick={handleResolve}
                    data-no-dnd="true"
                    disabled={isResolving}
                    aria-label={done ? `Mark ${title} not done` : isResolving ? "Checking in" : `Check in ${title}`}
                    className="group/check relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 lg:h-9 lg:w-9"
                >
                    <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] text-moonlit transition-[background-color,border-color] duration-200 lg:h-7 lg:w-7 ${
                            done
                                ? "border-moonlit/50 bg-moonlit/20"
                                : isResolving
                                    ? "border-accent-primary/60 bg-accent-primary/15"
                                    : "border-moonlit/40 group-hover/check:border-moonlit/70"
                        }`}
                    >
                        {done ? (
                            <Check size={14} aria-hidden="true" />
                        ) : isResolving ? (
                            <Clock3 className="h-3 w-3 animate-pulse" aria-hidden="true" />
                        ) : (
                            <RoutineMark emoji={emoji} size={12} className="opacity-90" />
                        )}
                    </span>
                </button>
            )}
            onOpen={onOpen}
            ariaLabel={`Open routine ${title}`}
            className="items-center py-1.5 hover:bg-moonlit/[0.05]"
        >
            <div className="flex min-w-0 items-baseline gap-3">
                <span className={`min-w-0 flex-1 truncate text-[15px] leading-snug ${done ? "text-twilight-text-muted line-through decoration-twilight-text-muted/60" : "text-twilight-text"}`}>
                    {title}
                </span>
                {meta ? <span className="shrink-0 text-[12px] tabular-nums text-twilight-text-soft">{meta}</span> : null}
            </div>
        </AgendaRow>
    );
}
