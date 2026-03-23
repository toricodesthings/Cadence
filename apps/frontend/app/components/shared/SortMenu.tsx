import { EllipsisVertical, ArrowUpDown, Sparkles, ArrowDownWideNarrow, GripVertical, Check } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import type { SortMode } from "../../lib/utils/task/sort-tasks";
import type { ViewMode } from "../../hooks/ui/use-view-mode";
import { ViewToggle } from "./ViewToggle";

interface SortMenuAction {
    label: string;
    onSelect: () => void;
    icon?: typeof Sparkles;
    danger?: boolean;
}

interface SortMenuProps {
    mode: SortMode;
    onModeChange: (mode: SortMode) => void;
    view?: ViewMode;
    onViewChange?: (view: ViewMode) => void;
    actions?: SortMenuAction[];
}

const SORT_OPTIONS: { value: SortMode; label: string; icon: typeof Sparkles }[] = [
    { value: "smart", label: "Smart order", icon: Sparkles },
    { value: "priority", label: "Priority", icon: ArrowDownWideNarrow },
    { value: "manual", label: "Manual", icon: GripVertical },
];

export function SortMenu({ mode, onModeChange, view, onViewChange, actions = [] }: SortMenuProps) {
    return (
        <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
                <button
                    aria-label="Sort & display options"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-twilight-border/35 text-twilight-text-soft transition-colors hover:bg-white/[0.06] hover:text-twilight-text cursor-pointer"
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
                        <DropdownMenu.Separator />
                    </>
                )}
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
                            <Check size={14} className="text-lantern-amber" aria-hidden="true" />
                        )}
                    </DropdownMenu.Item>
                ))}
                {actions.length > 0 && (
                    <>
                        <DropdownMenu.Separator />
                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-twilight-text-muted">
                            Actions
                        </div>
                        {actions.map(({ label, onSelect, icon: Icon, danger }) => (
                            <DropdownMenu.Item
                                key={label}
                                onSelect={onSelect}
                                className={`flex items-center gap-2 ${danger ? "text-red-400 focus:text-red-400 focus:bg-red-500/10" : ""}`}
                            >
                                {Icon ? <Icon size={14} aria-hidden="true" /> : null}
                                <span>{label}</span>
                            </DropdownMenu.Item>
                        ))}
                    </>
                )}
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
