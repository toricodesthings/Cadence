import { lazy, Suspense } from "react";
import { PanelRightClose } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { SortMode } from "../../lib/utils/task/sort-tasks";
import type { ViewMode } from "../../hooks/ui/use-view-mode";
import { ActiveFilterBar } from "./ActiveFilterBar";
import { ControlsSheet, type ControlsSheetSection } from "./ControlsSheet";
import { SortMenu } from "./SortMenu";
import { SORT_MODE_OPTIONS, SortOptionList } from "./SortOptionList";
import { ViewToggle } from "./ViewToggle";

const LazyFocusViewBar = lazy(() => import("../focus-views/FocusViewBar").then((m) => ({ default: m.FocusViewBar })));

const COMPACT_ACTION = "touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] px-4 text-sm font-medium text-twilight-text-soft";
const COMPACT_DANGER = "touch-target flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 text-sm font-medium text-red-400";

export interface RouteAction {
    label: string;
    icon: LucideIcon;
    onSelect: () => void;
    danger?: boolean;
    /** Phones can word or wire an action differently (no inline add input, for one). */
    compact?: { label?: string; onSelect?: () => void };
}

interface TaskRouteControlsProps {
    routeKey: string;
    title: string;
    view: ViewMode;
    onViewChange: (view: ViewMode) => void;
    sortMode: SortMode;
    onSortModeChange: (mode: SortMode) => void;
    /** Set while a task is selected and its panel isn't already beside the list. */
    onOpenDetails?: () => void;
    actions?: RouteAction[];
    /** Name of the actions group on phones. */
    actionsLabel?: string;
}

/** The header controls every task list route shares: focus views, view + sort, and the route's own actions, on phone or desktop. */
export function TaskRouteControls({ routeKey, title, view, onViewChange, sortMode, onSortModeChange, onOpenDetails, actions = [], actionsLabel = "Actions" }: TaskRouteControlsProps) {
    const shell = useShellMode();
    const focusViews = <Suspense fallback={null}><LazyFocusViewBar /></Suspense>;

    if (!shell.isCompact) {
        return (
            <div className="flex items-center gap-2">
                <ActiveFilterBar placement="header" />
                {focusViews}
                <SortMenu
                    mode={sortMode}
                    onModeChange={onSortModeChange}
                    view={view}
                    onViewChange={onViewChange}
                    actions={actions.map(({ label, icon, onSelect, danger }) => ({ label, icon, onSelect, danger }))}
                />
                {!shell.isWide && onOpenDetails ? (
                    <button
                        type="button"
                        onClick={onOpenDetails}
                        className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-twilight-border px-4 text-sm font-medium text-twilight-text-soft hover:bg-white/[0.04] hover:text-twilight-text"
                        aria-label="Open task details"
                    >
                        <PanelRightClose size={16} aria-hidden="true" />
                        Details
                    </button>
                ) : null}
            </div>
        );
    }

    const sections: ControlsSheetSection[] = [
        { id: "view", label: "View", content: <ViewToggle view={view} onViewChange={onViewChange} compact /> },
        {
            id: "sort",
            label: "Sort",
            display: "drill",
            summary: SORT_MODE_OPTIONS.find((option) => option.value === sortMode)?.label,
            content: <SortOptionList mode={sortMode} onModeChange={onSortModeChange} />,
        },
    ];
    if (actions.length > 0) {
        sections.push({
            id: "actions",
            label: actionsLabel,
            content: (
                <div className="space-y-2">
                    {actions.map(({ label, icon: Icon, onSelect, danger, compact }) => (
                        <button key={label} type="button" onClick={compact?.onSelect ?? onSelect} className={danger ? COMPACT_DANGER : COMPACT_ACTION}>
                            <Icon size={15} aria-hidden="true" />
                            {compact?.label ?? label}
                        </button>
                    ))}
                </div>
            ),
        });
    }
    if (onOpenDetails) {
        sections.push({
            id: "details",
            label: "Details",
            content: (
                <button type="button" onClick={onOpenDetails} className={COMPACT_ACTION}>
                    <PanelRightClose size={16} aria-hidden="true" />
                    Open task details
                </button>
            ),
        });
    }

    return (
        <div className="flex items-center gap-2">
            {focusViews}
            <ControlsSheet routeKey={routeKey} title={title} sections={sections} />
        </div>
    );
}
