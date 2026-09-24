import { useNavigate } from "react-router";

export interface DayEvent {
    id: string;
    label: string;
    emoji?: string | null;
    dateStr: string;
    dateLabel?: string | null;
}

/** A day's events above its tasks (list sections and board columns) as slim all-day rows, with no checkbox so they never read as tasks. */
export function DayEventRows({ events, className = "" }: { events: DayEvent[]; className?: string }) {
    const navigate = useNavigate();
    if (events.length === 0) return null;

    return (
        <ul aria-label="Events" className={`flex flex-col gap-1.5 ${className}`}>
            {events.map((evt) => (
                <li key={`${evt.id}-${evt.dateStr}`}>
                    <button
                        type="button"
                        onClick={() => navigate(`/events?event=${evt.id}`)}
                        className="flex min-h-11 w-full items-center gap-2.5 rounded-2xl border border-accent-nav-schedule/15 bg-accent-nav-schedule/[0.07] px-3.5 text-left text-[13px] font-medium text-accent-nav-schedule transition-colors hover:bg-accent-nav-schedule/[0.12] pointer-fine:min-h-9"
                    >
                        <span aria-hidden="true">{evt.emoji ?? "🎉"}</span>
                        <span className="min-w-0 flex-1 truncate">{evt.label}</span>
                        {evt.dateLabel ? <span className="shrink-0 text-xs text-accent-nav-schedule/60">{evt.dateLabel}</span> : null}
                    </button>
                </li>
            ))}
        </ul>
    );
}
