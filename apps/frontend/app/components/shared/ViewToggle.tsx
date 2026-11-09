import { LayoutList, KanbanSquare } from "lucide-react";
import type { ViewMode } from "../../hooks/ui/use-view-mode";
import { SegmentedControl } from "../primitives/SegmentedControl";

const OPTIONS = [
    { value: "list", label: "Rows", icon: <LayoutList size={14} aria-hidden="true" /> },
    { value: "kanban", label: "Board", icon: <KanbanSquare size={14} aria-hidden="true" /> },
] as const;

/** Rows ↔ Board, spanning its menu or sheet, one half per option. */
export function ViewToggle({ view, onViewChange }: { view: ViewMode; onViewChange: (view: ViewMode) => void }) {
    return <SegmentedControl ariaLabel="View" className="flex w-full [&>button]:flex-1" value={view} onChange={onViewChange} options={OPTIONS} />;
}
