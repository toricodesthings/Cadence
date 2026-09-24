import type { Tag } from "@cadence/contracts/tag";
import * as ContextMenu from "../primitives/ContextMenu";
import { Trash2 } from "lucide-react";
import { useDeleteTag } from "../../hooks/tags/use-delete-tag";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { resolveTagColor } from "../../lib/utils/color-resolver";

/** Drag payload for a tag chip; capture rows accept it to add the tag. */
export const TAG_DRAG_TYPE = "application/x-cadence-tag";

interface TagBubbleProps {
    tag: Tag;
    isActive: boolean;
    onClick: () => void;
}

/** A tag chip. Desktop filters by it (right-click deletes, drag onto a capture row tags it); compact opens its tag page, which owns delete. */
export function TagBubble({ tag, isActive, onClick }: TagBubbleProps) {
    const bgColor =
        !tag.color || tag.color === "default" ? "rgba(255,255,255,0.06)" : `${tag.color}15`;
    const textColor = resolveTagColor(tag.color, "var(--color-twilight-text-soft)");

    const { isCompact } = useShellMode();
    const deleteTag = useDeleteTag();

    const bubble = (
        <button
            onClick={onClick}
            draggable={!isCompact}
            onDragStart={(e) => {
                e.dataTransfer.setData(TAG_DRAG_TYPE, tag.id);
                e.dataTransfer.effectAllowed = "copy";
            }}
            className={`
                inline-flex max-w-full items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium
                transition-all duration-200 cursor-pointer shrink-0
                ${isCompact ? "min-h-11" : ""}
                ${isActive
                    ? "ring-1 ring-offset-1 ring-offset-twilight-deep shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_10%,transparent)]"
                    : "hover:brightness-125"
                }
            `}
            style={{
                backgroundColor: bgColor,
                color: textColor,
            }}
            {...(isCompact
                ? { "aria-current": isActive ? ("page" as const) : undefined, "aria-label": `Open tag: ${tag.name}` }
                : { "aria-pressed": isActive, "aria-label": `Filter by tag: ${tag.name}` })}
        >
            <span
                className="w-2 h-2 shrink-0 rounded-full"
                style={{ backgroundColor: textColor }}
            />
            <span className="text-truncate-safe">{tag.name}</span>
        </button>
    );

    if (isCompact) return bubble;

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger asChild>{bubble}</ContextMenu.Trigger>
            <ContextMenu.Content>
                <ContextMenu.Item
                    variant="danger"
                    className="flex items-center gap-2 text-[13px]"
                    onSelect={() => deleteTag.mutate(tag.id)}
                >
                    <Trash2 size={13} aria-hidden="true" />
                    Delete tag
                </ContextMenu.Item>
            </ContextMenu.Content>
        </ContextMenu.Root>
    );
}
