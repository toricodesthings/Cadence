import { LayoutList, KanbanSquare } from "lucide-react";
import type { ViewMode } from "../../hooks/use-view-mode";

interface ViewToggleProps {
    view: ViewMode;
    onViewChange: (view: ViewMode) => void;
}

/**
 * Shared List ↔ Board toggle control for the planner toolbar.
 * Renders as a segmented pill control.
 */
export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
    return (
        <div className="bg-twilight-backdrop/40 backdrop-blur-md rounded-lg p-0.5 border border-twilight-border/30 h-8 flex items-center">
            <button
                onClick={() => onViewChange("list")}
                className={`flex items-center gap-1.5 h-full px-3 text-xs font-medium rounded-md transition-all cursor-pointer
                    ${view === "list"
                        ? "bg-white/10 text-twilight-text shadow-sm"
                        : "text-twilight-text-muted hover:text-twilight-text/80 hover:bg-white/[0.03]"
                    }`}
                aria-pressed={view === "list"}
            >
                <LayoutList size={14} />
                List
            </button>
            <button
                onClick={() => onViewChange("kanban")}
                className={`flex items-center gap-1.5 h-full px-3 text-xs font-medium rounded-md transition-all cursor-pointer
                    ${view === "kanban"
                        ? "bg-white/10 text-twilight-text shadow-sm"
                        : "text-twilight-text-muted hover:text-twilight-text/80 hover:bg-white/[0.03]"
                    }`}
                aria-pressed={view === "kanban"}
            >
                <KanbanSquare size={14} />
                Board
            </button>
        </div>
    );
}
