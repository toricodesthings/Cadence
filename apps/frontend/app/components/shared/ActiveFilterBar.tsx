import { X, Tag as TagIcon } from "lucide-react";
import { useTagFilterStore } from "../../stores/tag-filter-store";
import { useTags } from "../../hooks/tags";

/**
 * Compact inline bar that surfaces the currently active tag filter.
 * Renders nothing when no filter is active.
 */
export function ActiveFilterBar() {
    const { activeTagId, setActiveTag } = useTagFilterStore();
    const { data: tags = [] } = useTags();

    if (!activeTagId) return null;

    const tag = tags.find((t) => t.id === activeTagId);
    const label = tag?.name ?? "Filter";
    const color = tag?.color && tag.color !== "default" ? tag.color : undefined;

    return (
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-twilight-text-soft">
            <TagIcon size={12} style={color ? { color } : undefined} aria-hidden="true" />
            <span className="truncate max-w-[10rem]" style={color ? { color } : undefined}>
                {label}
            </span>
            <button
                type="button"
                onClick={() => setActiveTag(null)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-twilight-text-muted hover:bg-white/[0.08] hover:text-twilight-text transition-colors"
                aria-label={`Clear ${label} filter`}
            >
                <X size={10} aria-hidden="true" />
            </button>
        </div>
    );
}
