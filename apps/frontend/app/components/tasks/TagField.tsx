import { useState } from "react";
import { useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { useTags } from "../../hooks/tags/use-tags";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { Button } from "../primitives/Button";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { TagBubble } from "../sidebar/TagBubble";
import { TagPickerList, TagPickerSheet } from "./TagPickerSubmenu";

/** Tag chips plus the shared picker: a menu on desktop, a sheet on compact. */
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
    const navigate = useNavigate();
    const [sheetOpen, setSheetOpen] = useState(false);

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {tagIds.map((tagId) => {
                const tag = tags?.find((t) => t.id === tagId);
                if (!tag) return null;
                return (
                    <TagBubble
                        key={tag.id}
                        tag={tag}
                        isActive={false}
                        onClick={() => {
                            if (isCompact) navigate(`/tag/${tag.id}`);
                        }}
                    />
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
