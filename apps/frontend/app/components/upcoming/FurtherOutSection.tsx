import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Telescope } from "lucide-react";
import type { Task } from "@cadence/contracts/task";
import type { LocalDate } from "@cadence/domain/time";
import type { BucketedCollectionSection } from "../shared/BucketedCollectionView";
import { useDeviceFlag } from "../../hooks/ui/use-device-flag";
import { formatShortDateLabel } from "../../lib/utils/date-format";
import { groupFurtherOut } from "../../lib/utils/task/horizon";

const OPEN_STORAGE_KEY = "cadence-upcoming-further-open";

/** Weekly Reset's look-ahead opens Upcoming with Further out unfolded. */
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
export function useFurtherOutSection({ items, today, focusTaskId, openRequested, compact, renderTasks }: {
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
    if (!revealed && (openRequested || (focusTaskId !== undefined && items.some((item) => item.task.id === focusTaskId)))) setRevealed(true);
    const groups = useMemo(() => {
        const byDay = [...items].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.task.title.localeCompare(b.task.title));
        return groupFurtherOut(byDay, today);
    }, [items, today]);
    if (items.length === 0) return null;

    const open = keptOpen || revealed;
    const toggle = () => {
        setRevealed(false);
        setKeptOpen(!open);
    };
    const next = groups[0].items[0];
    const label = open ? "Fold further out" : `Show ${items.length} further out`;
    const toggleButton = (
        <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-label={label}
            title={label}
            className="touch-target -my-3 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
        >
            <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
    );
    const content = (cardVariant?: "board") => (
        <div className="flex flex-col gap-4">
            {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-1.5">
                    <h3 className="px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-twilight-text-muted">{group.label}</h3>
                    {renderTasks(group.items.map((item) => item.task), cardVariant)}
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
        description: open ? undefined : (
            <button type="button" onClick={toggle} className="cursor-pointer text-left text-[13px] text-twilight-text-muted transition-colors hover:text-twilight-text-soft">
                Next: {next.task.title} · {formatShortDateLabel(next.dueDate)}
            </button>
        ),
        headerAction: toggleButton,
        listOpen: open,
        listContent: content(),
        // A desktop board folds it to a rail; a phone board shows one column at a time, so there is nothing to fold.
        boardCollapsed: !compact && !open,
        onBoardExpand: toggle,
        boardHeaderAction: compact ? null : toggleButton,
        boardContent: content("board"),
    };
}
