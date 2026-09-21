import { X } from "lucide-react";
import { useTagFilterStore } from "../../stores/tag-filter-store";
import { useTags } from "../../hooks/tags";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { Tip } from "../primitives/Tooltip";

/**
 * Chip that surfaces the currently active tag filter; clicking it clears the filter.
 * Renders nothing when no filter is active. `header` placement (page header actions) is
 * desktop/tablet only; `body` placement is the compact fallback where the header is too tight.
 */
export function ActiveFilterBar({ placement }: { placement: "header" | "body" }) {
    const { activeTagId, setActiveTag } = useTagFilterStore();
    const { data: tags = [] } = useTags();
    const { isCompact } = useShellMode();

    if (!activeTagId || isCompact !== (placement === "body")) return null;

    const tag = tags.find((t) => t.id === activeTagId);
    const label = tag?.name ?? "Filter";
    const color = tag?.color && tag.color !== "default" ? tag.color : undefined;
    const tint = color ?? "var(--color-twilight-text-soft)";

    return (
        <Tip label={`Clear ${label} filter`} side="bottom">
            <button
                type="button"
                onClick={() => setActiveTag(null)}
                aria-label={`Clear ${label} filter`}
                className="group inline-flex h-9 max-w-[14rem] shrink-0 cursor-pointer items-center gap-2 rounded-full border pl-3 pr-2 text-[13px] font-medium transition-[filter,box-shadow] duration-200 hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary"
                style={{
                    color: tint,
                    backgroundColor: color ? `${color}15` : "rgba(255,255,255,0.06)",
                    borderColor: color ? `${color}33` : "rgba(255,255,255,0.08)",
                }}
            >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tint }} aria-hidden="true" />
                <span className="text-truncate-safe">{label}</span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] transition-colors group-hover:bg-white/[0.14]">
                    <X size={11} aria-hidden="true" />
                </span>
            </button>
        </Tip>
    );
}
