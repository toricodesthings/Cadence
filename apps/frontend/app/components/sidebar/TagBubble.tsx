import type { Tag } from "@cadence/contracts/tag";
import * as ContextMenu from "../primitives/ContextMenu";
import { ArrowLeft, ArrowRight, Check, Palette, Trash2 } from "lucide-react";
import { TAG_COLOR_NAMES, TAG_PALETTE } from "@cadence/contracts/constants";
import { useDeleteTag } from "../../hooks/tags/use-delete-tag";
import { useUpdateTag } from "../../hooks/tags/use-update-tag";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { resolveTagColor } from "../../lib/utils/color-resolver";

/** Drag payload for a tag chip; capture rows accept it to add the tag. */
export const TAG_DRAG_TYPE = "application/x-cadence-tag";

interface TagBubbleProps {
    tag: Tag;
    isActive: boolean;
    onClick: () => void;
    /** Reordering (desktop): dragging starts it (the cloud moves the others), the menu moves one step. */
    reorder?: {
        first: boolean;
        last: boolean;
        onMove: (by: -1 | 1) => void;
        onDragStart: () => void;
        /** This chip is the one being dragged: it stays as the slot it will land in. */
        dragging: boolean;
    };
}

/** A tag chip. Desktop filters by it (right-click recolours or deletes, drag onto a capture row tags it); compact opens its tag page, which owns delete. */
export function TagBubble({ tag, isActive, onClick, reorder }: TagBubbleProps) {
    const tint =
        !tag.color || tag.color === "default" ? "rgba(255,255,255,0.06)" : `${tag.color}15`;
    const textColor = resolveTagColor(tag.color, "var(--color-twilight-text-soft)");

    const { isCompact } = useShellMode();
    const deleteTag = useDeleteTag();
    const updateTag = useUpdateTag();

    const bubble = (
        <button
            onClick={onClick}
            draggable={!isCompact}
            onDragStart={(e) => {
                e.dataTransfer.setData(TAG_DRAG_TYPE, tag.id);
                e.dataTransfer.effectAllowed = "copyMove";
                reorder?.onDragStart();
            }}
            data-tag-id={tag.id}
            className={`
                tag-bubble inline-flex max-w-full items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium
                transition-[opacity,scale,filter,box-shadow] duration-200 cursor-pointer shrink-0
                ${reorder?.dragging ? "opacity-35 scale-95" : ""}
                ${isCompact ? "min-h-11" : ""}
                ${isActive
                    ? "ring-1 ring-offset-1 ring-offset-twilight-deep shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_10%,transparent)]"
                    : "hover:brightness-125"
                }
            `}
            style={{
                // An image layer, so photo mode can lay a panel base under the tint.
                backgroundImage: `linear-gradient(${tint}, ${tint})`,
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
        <span className="relative inline-flex min-w-0 max-w-full shrink-0">
        <ContextMenu.Root>
            <ContextMenu.Trigger asChild>{bubble}</ContextMenu.Trigger>
            <ContextMenu.Content>
                <ContextMenu.Sub>
                    <ContextMenu.SubTrigger className="flex items-center gap-2 text-[13px]">
                        <Palette size={13} aria-hidden="true" />
                        Colour
                    </ContextMenu.SubTrigger>
                    <ContextMenu.Portal>
                    <ContextMenu.SubContent className="max-h-[var(--radix-context-menu-content-available-height)] overflow-y-auto overscroll-contain">
                        {TAG_PALETTE.map((color, i) => (
                            <ContextMenu.Item
                                key={color}
                                className="text-[13px] capitalize"
                                onSelect={() => updateTag.mutate({ id: tag.id, color })}
                            >
                                <span
                                    aria-hidden="true"
                                    className="size-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: resolveTagColor(color) }}
                                />
                                <span className="flex-1">{TAG_COLOR_NAMES[i].replace("-", " ")}</span>
                                {(tag.color || "default") === color ? <Check size={13} className="text-accent-primary" aria-hidden="true" /> : null}
                            </ContextMenu.Item>
                        ))}
                    </ContextMenu.SubContent>
                    </ContextMenu.Portal>
                </ContextMenu.Sub>
                {reorder ? (
                    <>
                        <ContextMenu.Item className="text-[13px]" disabled={reorder.first} onSelect={() => reorder.onMove(-1)}>
                            <ArrowLeft size={13} aria-hidden="true" />
                            Move earlier
                        </ContextMenu.Item>
                        <ContextMenu.Item className="text-[13px]" disabled={reorder.last} onSelect={() => reorder.onMove(1)}>
                            <ArrowRight size={13} aria-hidden="true" />
                            Move later
                        </ContextMenu.Item>
                    </>
                ) : null}
                <ContextMenu.Separator />
                <ContextMenu.Item
                    variant="danger"
                    className="text-[13px]"
                    onSelect={() => deleteTag.mutate({ id: tag.id, name: tag.name })}
                >
                    <Trash2 size={13} aria-hidden="true" />
                    Delete tag
                </ContextMenu.Item>
            </ContextMenu.Content>
        </ContextMenu.Root>
        </span>
    );
}
