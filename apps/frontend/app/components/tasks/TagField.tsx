import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useTags } from "../../hooks/tags/use-tags";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { Button } from "../primitives/Button";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { resolveTagColor } from "../../lib/utils/color-resolver";
import { TagPickerList, TagPickerSheet } from "./TagPickerSubmenu";

/** Tag chips plus the shared picker: a menu on desktop, a sheet on compact. A chip removes its tag: hover shows the ×, touch always does. */
export function TagField({
    tagIds,
    onAdd,
    onRemove,
}: {
    tagIds: string[];
    onAdd: (tagId: string) => void;
    onRemove: (tagId: string) => void;
}) {
    const { data: tags } = useTags();
    const { isCompact } = useShellMode();
    const [sheetOpen, setSheetOpen] = useState(false);

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {tagIds.map((tagId) => {
                const tag = tags?.find((t) => t.id === tagId);
                if (!tag) return null;
                const color = resolveTagColor(tag.color, "var(--color-twilight-text-soft)");
                return (
                    <Button
                        key={tag.id}
                        variant="ghost"
                        size="none"
                        onClick={() => onRemove(tag.id)}
                        aria-label={`Remove tag ${tag.name}`}
                        className="group/tag min-h-9 max-w-full gap-2 rounded-full px-3 text-[13px] font-medium hover:brightness-125 active:scale-100 pointer-coarse:min-h-11"
                        style={{ backgroundColor: !tag.color || tag.color === "default" ? "rgba(255,255,255,0.06)" : `${tag.color}15`, color }}
                    >
                        <span className="relative grid size-3.5 shrink-0 place-items-center" aria-hidden="true">
                            <span
                                className="size-2 rounded-full transition-opacity group-hover/tag:opacity-0 group-focus-visible/tag:opacity-0 pointer-coarse:opacity-0"
                                style={{ backgroundColor: color }}
                            />
                            <X
                                size={14}
                                strokeWidth={2.5}
                                className="absolute opacity-0 transition-opacity group-hover/tag:opacity-100 group-focus-visible/tag:opacity-100 pointer-coarse:opacity-100"
                            />
                        </span>
                        <span className="truncate">{tag.name}</span>
                    </Button>
                );
            })}
            {isCompact ? (
                <>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSheetOpen(true)}
                        className="min-h-11 rounded-full border border-dashed border-twilight-border px-4 text-[13px]"
                    >
                        <Plus size={14} aria-hidden="true" />
                        Tags
                    </Button>
                    <TagPickerSheet
                        open={sheetOpen}
                        onClose={() => setSheetOpen(false)}
                        activeTagIds={tagIds}
                        onAdd={onAdd}
                        onRemove={onRemove}
                    />
                </>
            ) : (
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-9 rounded-full border border-dashed border-twilight-border px-3 text-[12px]"
                        >
                            <Plus size={12} aria-hidden="true" />
                            Add tag
                        </Button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="start" className="w-56 p-2">
                        <TagPickerList
                            activeTagIds={tagIds}
                            onAdd={onAdd}
                            onRemove={onRemove}
                            MenuComponents={DropdownMenu}
                        />
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            )}
        </div>
    );
}
