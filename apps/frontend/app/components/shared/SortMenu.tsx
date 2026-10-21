import { EllipsisVertical, ArrowUpDown, Sparkles, GripVertical, Check } from "lucide-react";
import { PRIORITY_ICON } from "../tasks/task-choice-options";
import * as DropdownMenu from "../primitives/DropdownMenu";
import type { SortMode } from "../../lib/utils/task/sort-tasks";
import type { ViewMode } from "../../hooks/ui/use-view-mode";
import { ViewToggle } from "./ViewToggle";
import { HEADER_ICON_BUTTON } from "../layout/PageHeader";
import { ClaimHeaderMenu, LayoutScaleMenuRow } from "../layout/LayoutScaleMenu";

interface SortMenuAction {
    label: string;
    onSelect: () => void;
    icon?: typeof Sparkles;
    danger?: boolean;
    /** Shown in place, greyed out with this reason, rather than hidden: the menu keeps its shape. */
    disabledReason?: string;
}

interface SortMenuProps {
    /** Omit on routes that sort elsewhere (Capture orders from its Focus menu). */
    mode?: SortMode;
    onModeChange?: (mode: SortMode) => void;
    view?: ViewMode;
    onViewChange?: (view: ViewMode) => void;
    actions?: SortMenuAction[];
}

const SORT_OPTIONS: { value: SortMode; label: string; icon: typeof Sparkles }[] = [
    { value: "smart", label: "Smart order", icon: Sparkles },
    { value: "priority", label: "Priority", icon: PRIORITY_ICON },
    { value: "manual", label: "Manual", icon: GripVertical },
];

export function SortMenu({ mode, onModeChange, view, onViewChange, actions = [] }: SortMenuProps) {
    return (
        <>
        <ClaimHeaderMenu />
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    aria-label={onModeChange ? "Sort & display options" : "Display options"}
                    className={HEADER_ICON_BUTTON}
                >
                    <EllipsisVertical size={18} aria-hidden="true" />
                </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
                {view !== undefined && onViewChange && (
                    <>
                        <div className="px-3 pt-2 pb-2.5">
                            <ViewToggle view={view} onViewChange={onViewChange} compact />
                        </div>
                        {onModeChange && <DropdownMenu.Separator />}
                    </>
                )}
                {onModeChange && (
                    <>
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-twilight-text-muted">
                            <div className="flex items-center gap-1.5">
                                <ArrowUpDown size={11} aria-hidden="true" />
                                Sort by
                            </div>
                        </div>
                        {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
                            <DropdownMenu.Item
                                key={value}
                                onSelect={() => onModeChange(value)}
                                className="flex items-center gap-2"
                            >
                                <Icon size={14} aria-hidden="true" />
                                <span className="flex-1">{label}</span>
                                {mode === value && (
                                    <Check size={14} className="text-accent-primary" aria-hidden="true" />
                                )}
                            </DropdownMenu.Item>
                        ))}
                    </>
                )}
                {actions.length > 0 && (
                    <>
                        <DropdownMenu.Separator />
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-twilight-text-muted">
                            Actions
                        </div>
                        {actions.map(({ label, onSelect, icon: Icon, danger, disabledReason }) => (
                            <DropdownMenu.Item
                                key={label}
                                onSelect={onSelect}
                                disabled={!!disabledReason}
                                className={`flex items-center gap-2 ${danger ? "text-red-400 focus:text-red-400 focus:bg-red-500/10" : ""}`}
                            >
                                {Icon ? <Icon size={14} aria-hidden="true" className="shrink-0" /> : null}
                                <span className="flex flex-col">
                                    <span>{label}</span>
                                    {disabledReason ? <span className="text-xs text-twilight-text-muted">{disabledReason}</span> : null}
                                </span>
                            </DropdownMenu.Item>
                        ))}
                    </>
                )}
                <LayoutScaleMenuRow />
            </DropdownMenu.Content>
        </DropdownMenu.Root>
        </>
    );
}
