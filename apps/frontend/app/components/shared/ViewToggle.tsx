import { LayoutList, KanbanSquare } from "lucide-react";
import type { ViewMode } from "../../hooks/ui/use-view-mode";
import { useShellMode } from "../../hooks/ui/use-shell-mode";

interface ViewToggleProps {
    view: ViewMode;
    onViewChange: (view: ViewMode) => void;
    compact?: boolean;
}

/**
 * Shared List ↔ Board toggle control for the planner toolbar.
 * Renders as a segmented pill control.
 */
export function ViewToggle({ view, onViewChange, compact = false }: ViewToggleProps) {
    const shell = useShellMode();
    const isCompact = compact || shell.isPhone;

    return (
        <div className={`flex items-center rounded-2xl border border-twilight-border/30 bg-twilight-base/40 p-1 backdrop-blur-md ${isCompact ? "gap-0.5" : ""}`}>
            <button
                type="button"
                onClick={() => onViewChange("list")}
                className={`touch-target flex min-h-10 items-center gap-1.5 rounded-xl ${isCompact ? "px-3 text-[13px]" : "px-4 text-sm"} font-medium transition-all cursor-pointer
                    ${view === "list"
                        ? "bg-white/10 text-twilight-text shadow-sm"
                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.03]"
                    }`}
                aria-pressed={view === "list"}
            >
                <LayoutList size={14} />
                List
            </button>
            <button
                type="button"
                onClick={() => onViewChange("kanban")}
                className={`touch-target flex min-h-10 items-center gap-1.5 rounded-xl ${isCompact ? "px-3 text-[13px]" : "px-4 text-sm"} font-medium transition-all cursor-pointer
                    ${view === "kanban"
                        ? "bg-white/10 text-twilight-text shadow-sm"
                        : "text-twilight-text-soft hover:text-twilight-text hover:bg-white/[0.03]"
                    }`}
                aria-pressed={view === "kanban"}
            >
                <KanbanSquare size={14} />
                Board
            </button>
        </div>
    );
}
