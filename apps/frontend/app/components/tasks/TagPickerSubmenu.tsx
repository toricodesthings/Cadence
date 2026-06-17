import React, { useState } from "react";
import { Tag as TagIcon, ChevronRight, Plus, Check, Hash } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ScrollArea from "../primitives/ScrollArea";
import { useTags, useCreateTag } from "../../hooks/tags";
import type { Tag } from "@cadence/contracts/tag";
import { TAG_PALETTE } from "../../lib/constants/colors";

interface TagPickerSubmenuProps {
    activeTagIds: string[];
    onAdd: (tagId: string) => void;
    onRemove: (tagId: string) => void;
    MenuComponents?: any;
}

export interface TagPickerListProps {
    activeTagIds: string[];
    onAdd: (tagId: string) => void;
    onRemove: (tagId: string) => void;
    MenuComponents?: any;
}

export const TagPickerList: React.FC<TagPickerListProps> = ({
    activeTagIds,
    onAdd,
    onRemove,
    MenuComponents: Menu = DropdownMenu,
}) => {
    const { data: tags = [] } = useTags();
    const createTag = useCreateTag();
    const [newTagName, setNewTagName] = useState("");

    const [selectedColor, setSelectedColor] = useState("default");

    const TAG_COLORS = TAG_PALETTE;

    const handleCreate = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && newTagName.trim()) {
            const saved = await createTag.mutateAsync({ name: newTagName.trim(), color: selectedColor });
            setNewTagName("");
            setSelectedColor("default");
            onAdd(saved.id);
        }
    };

    return (
        <>
            <div className="mb-2 px-1">
                <div className="flex items-center gap-2 rounded-xl border border-twilight-border bg-twilight-surface-muted px-2 py-1.5 focus-within:border-accent-primary">
                    <Plus size={14} className="text-twilight-text-muted" />
                    <input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={handleCreate}
                        placeholder="Create new tag..."
                        className="w-full bg-transparent text-[13px] outline-none placeholder:text-twilight-text-muted/80"
                    />
                </div>
                {newTagName.trim().length > 0 && (
                    <div className="mt-2 flex items-center justify-between px-1 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-1.5">
                            {TAG_COLORS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setSelectedColor(color)}
                                    className={`w-4 h-4 rounded-full transition-transform ${selectedColor === color ? "scale-125 ring-1 ring-offset-1 ring-offset-twilight ring-accent-primary" : "hover:scale-110"}`}
                                    style={{ backgroundColor: color === "default" ? "var(--color-twilight-text-muted)" : color }}
                                    aria-label={`Select color ${color}`}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <ScrollArea.Root className="h-60" type="scroll">
                <ScrollArea.Viewport className="h-full w-full">
                    <div className="pr-3">

                        {tags.length === 0 && !newTagName && (
                            <div className="px-2 py-4 text-center text-[10px] text-twilight-text-muted">
                                No tags created yet
                            </div>
                        )}
                        {tags.map((tag) => {
                            const isActive = activeTagIds.includes(tag.id);
                            // Ensure the new tag we are creating isn't literally matching existing tags (or hide existing ones when creating exact match)
                            if (newTagName.trim() && tag.name.toLowerCase() === newTagName.trim().toLowerCase()) return null;

                            return (
                                <Menu.Item
                                    key={tag.id}
                                    onClick={(e: React.MouseEvent) => {
                                        e.preventDefault(); // Keep menu open for multi-tag selection
                                        isActive ? onRemove(tag.id) : onAdd(tag.id);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <div
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: !tag.color || tag.color === "default" ? "var(--color-twilight-text-muted)" : tag.color }}
                                    />
                                    <span className="flex-1 truncate">{tag.name}</span>
                                    {isActive && <Check size={14} className="text-accent-primary" />}
                                </Menu.Item>
                            );
                        })}

                    </div>
                </ScrollArea.Viewport>
                <ScrollArea.Scrollbar orientation="vertical">
                    <ScrollArea.Thumb />
                </ScrollArea.Scrollbar>
            </ScrollArea.Root>
        </>
    );
};

export const TagPickerSubmenu: React.FC<TagPickerSubmenuProps> = (props) => {
    const Menu = props.MenuComponents || DropdownMenu;

    return (
        <Menu.Sub>
            <Menu.SubTrigger className="flex items-center gap-2">
                <TagIcon size={16} />
                <span>Tags</span>
                <ChevronRight size={14} className="ml-auto text-twilight-text-muted" />
            </Menu.SubTrigger>
            <Menu.Portal>
                <Menu.SubContent className="w-56 p-2">
                    <TagPickerList {...props} />
                </Menu.SubContent>
            </Menu.Portal>
        </Menu.Sub>
    );
};
