import { useId, useState, type ReactNode } from "react";
import { CheckSquare, ChevronRight, MessageSquare, Plus, type LucideIcon } from "lucide-react";
import type { LocalDate } from "@cadence/domain/time";
import { Button } from "../primitives/Button";
import { Reveal } from "../shared/Reveal";
import { useCaptureFeed } from "../../hooks/inbox/use-capture-feed";
import { formatWeekdayShort, placementLabel } from "../../lib/utils/date-format";
import { usePlaceTask, usePlaceThought } from "./PlaceSheet";

export function PlaceCaptureTray({ day }: { day: LocalDate }) {
    const feed = useCaptureFeed();
    const placeTask = usePlaceTask();
    const placeThought = usePlaceThought();
    const [open, setOpen] = useState(false);
    const panelId = useId();
    const count = feed.tasks.length + feed.thoughts.length;
    if (count === 0) return null;
    const near = placementLabel(day);
    const dayName = near === "Today" || near === "Tomorrow" ? near : formatWeekdayShort(day);

    return (
        <div className="mt-4 border-t border-twilight-border/40 pt-3">
            <Button
                variant="ghost"
                size="none"
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => setOpen((o) => !o)}
                className="surface-control flex min-h-11 w-full cursor-pointer justify-between rounded-2xl px-3.5 font-sans text-sm font-medium text-twilight-text hover:text-twilight-text"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <Plus size={15} aria-hidden="true" className="shrink-0 text-accent-primary" />
                    <span className="truncate">Place on {dayName}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                    <span className="surface-item rounded-full px-2 py-0.5 text-[11px] tabular-nums text-twilight-text-soft">
                        {count}
                    </span>
                    <ChevronRight
                        size={15}
                        aria-hidden="true"
                        className={`text-twilight-text-muted transition-transform duration-150 ease-out ${open ? "rotate-90" : ""}`}
                    />
                </span>
            </Button>
            <Reveal open={open} id={panelId}>
                <ul className="mt-2 space-y-1">
                    {feed.tasks.map((task) => (
                        <TrayRow
                            key={task.id}
                            icon={CheckSquare}
                            title={task.title}
                            dayName={dayName}
                            onPlace={() => placeTask(task, day)}
                        />
                    ))}
                    {feed.thoughts.map((item) => (
                        <TrayRow
                            key={item.id}
                            icon={MessageSquare}
                            title={item.rawText}
                            dayName={dayName}
                            onPlace={() => placeThought(item, day)}
                        />
                    ))}
                </ul>
            </Reveal>
        </div>
    );
}

function TrayRow({
    icon: Icon,
    title,
    dayName,
    onPlace,
}: {
    icon: LucideIcon;
    title: ReactNode;
    dayName: string;
    onPlace: () => Promise<unknown>;
}) {
    const [pending, setPending] = useState(false);
    return (
        <li className="surface-row flex min-h-11 items-center gap-2.5 rounded-xl py-1 pl-3 pr-1">
            <Icon size={14} aria-hidden="true" className="shrink-0 text-twilight-text-soft" />
            <span className="min-w-0 flex-1 truncate text-sm text-twilight-text">{title}</span>
            <Button
                variant="cardPrimary"
                size="sm"
                type="button"
                disabled={pending}
                aria-label={`Place ${title} on ${dayName}`}
                onClick={() => {
                    setPending(true);
                    void onPlace()
                        .catch(() => {})
                        .finally(() => setPending(false));
                }}
                className="shrink-0 rounded-[10px] font-sans"
            >
                Place
            </Button>
        </li>
    );
}
