import type { Tag } from "../../types/tag";
import * as ContextMenu from "../primitives/ContextMenu";
import { Trash2 } from "lucide-react";
import { useDeleteTag } from "../../hooks/tags/use-delete-tag";

interface TagBubbleProps {
    tag: Tag;
    isActive: boolean;
    onClick: () => void;
}

export function TagBubble({ tag, isActive, onClick }: TagBubbleProps) {
    const bgColor =
        tag.color === "default" ? "rgba(255,255,255,0.06)" : `${tag.color}15`;
    const textColor =
        tag.color === "default" ? "var(--color-twilight-text-soft)" : tag.color;

    const deleteTag = useDeleteTag();

    return (
        <ContextMenu.Root>
            <ContextMenu.Trigger asChild>
                <button
                    onClick={onClick}
                    className={`
                        inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium
                        transition-all duration-200 cursor-pointer shrink-0
                        ${isActive
                            ? "ring-1 ring-offset-1 ring-offset-twilight-deep shadow-[0_0_8px_rgba(232,164,74,0.1)]"
                            : "hover:brightness-125"
                        }
                    `}
                    style={{
                        backgroundColor: bgColor,
                        color: textColor,
                    }}
                    aria-pressed={isActive}
                    aria-label={`Filter by tag: ${tag.name}`}
                >
                    <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: textColor }}
                    />
                    {tag.name}
                </button>
            </ContextMenu.Trigger>
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
