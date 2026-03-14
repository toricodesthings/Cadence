import { EllipsisVertical, ArrowUpDown, Sparkles, ArrowDownWideNarrow, GripVertical, Check } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import type { SortMode } from "../../lib/utils/sort-tasks";

interface SortMenuProps {
    mode: SortMode;
    onModeChange: (mode: SortMode) => void;
}

const SORT_OPTIONS: { value: SortMode; label: string; icon: typeof Sparkles }[] = [
    { value: "smart", label: "Smart", icon: Sparkles },
    { value: "priority", label: "Priority", icon: ArrowDownWideNarrow },
    { value: "manual", label: "Manual", icon: GripVertical },
];

export function SortMenu({ mode, onModeChange }: SortMenuProps) {
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
            </DropdownMenu.Content>
        </DropdownMenu.Root>
    );
}
