import { useMemo, useState, type ReactNode } from "react";
import { Telescope } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import type { LocalDate } from "@cadence/domain/time";
import type { BucketedCollectionSection } from "../shared/BucketedCollectionView";
import { EyeToggle } from "../shared/EyeToggle";
import { useDeviceFlag } from "../../hooks/ui/use-device-flag";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { groupFurtherOut } from "../../lib/utils/task/horizon";

const OPEN_STORAGE_KEY = "cadence-upcoming-further-open";

/** `/upcoming?further` opens Upcoming with Further out unfolded, for one visit. */
export const FURTHER_OUT_OPEN_PARAM = "further";

export interface FurtherOutItem {
    task: Task;
    /** The day it sits on in Upcoming (its timed start's day, else its deadline). */
    dueDate: LocalDate;
}

/**
 * Upcoming's last section: every task past the 7-day window, so nothing dated is ever out of sight. Folded, it is one
 * quiet line (the count, the next one due); open, it groups by week, then by month. The fold is kept per device, and a
 * visit that points inside it (a search or reminder tap, Weekly Reset's link) opens it for that visit only.
 */
export function useFurtherOutSection({
    items,
    today,
    focusTaskId,
    openRequested,
    compact,
    renderTasks,
}: {
    items: FurtherOutItem[];
    today: LocalDate;
    focusTaskId: string | undefined;
    openRequested: boolean;
    compact: boolean;
    renderTasks: (tasks: Task[], cardVariant?: "board") => ReactNode;
}): BucketedCollectionSection | null {
    const [keptOpen, setKeptOpen] = useDeviceFlag(OPEN_STORAGE_KEY);
    const [revealed, setRevealed] = useState(false);
    // Latched during render, not in an effect, so the target row mounts in the same commit the visit starts.
    if (
        !revealed &&
        (openRequested || (focusTaskId !== undefined && items.some((item) => item.task.id === focusTaskId)))
    )
        setRevealed(true);
    const groups = useMemo(() => {
        const byDay = [...items].sort(
            (a, b) => a.dueDate.localeCompare(b.dueDate) || a.task.title.localeCompare(b.task.title),
        );
        return groupFurtherOut(byDay, today);
    }, [items, today]);
    if (items.length === 0) return null;

    const open = keptOpen || revealed;
    const toggle = () => {
        setRevealed(false);
        setKeptOpen(!open);
    };
    const next = groups[0].items[0];
    const eye = (
        <EyeToggle
            hidden={!open}
            label={open ? "Hide further out" : `Show ${items.length} further out`}
            onToggle={toggle}
        />
    );
    const content = (cardVariant?: "board") => (
        <div className="flex flex-col gap-4">
            {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                    <h3 className="px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-twilight-text-muted">
                        {group.label}
                    </h3>
                    {renderTasks(
                        group.items.map((item) => item.task),
                        cardVariant,
                    )}
                </div>
            ))}
        </div>
    );

    return {
        key: "further",
        title: "Further out",
        icon: Telescope,
        accentClass: "text-twilight-text-soft",
        count: items.length,
        // Folded, one quiet line under the title: what comes next and when. A tap unfolds the section.
        foldedPeek: (
            <button
                type="button"
                onClick={toggle}
                aria-label={`Show ${items.length} further out. Next: ${next.task.title}, ${formatShortDateLabel(next.dueDate)}`}
                className="group/peek press press-none -mt-1 ml-8 flex w-[calc(100%-2rem)] min-w-0 cursor-pointer items-baseline gap-3 rounded-full px-3 py-2 text-left transition-colors hover:bg-panel-raised/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-twilight-text-muted/90">
                    Next
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-twilight-text-soft transition-colors group-hover/peek:text-twilight-text">
                    {next.task.title}
                </span>
                <span className="shrink-0 text-[12px] tabular-nums text-twilight-text-muted/90">
                    {formatShortDateLabel(next.dueDate)}
                </span>
            </button>
        ),
        listFold: { open, toggle },
        listContent: content(),
        // A desktop board folds it to a rail; a phone board shows one column at a time, so there is nothing to fold.
        boardCollapsed: !compact && !open,
        onBoardExpand: toggle,
        boardHeaderAction: compact ? null : eye,
        boardContent: content("board"),
    };
}
