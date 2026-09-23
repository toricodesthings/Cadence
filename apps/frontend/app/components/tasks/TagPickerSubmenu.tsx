import React, { useState } from "react";
import { Tag as TagIcon, ChevronRight, Plus, Check } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as ScrollArea from "../primitives/ScrollArea";
import { useTags } from "../../hooks/tags/use-tags";
import { useCreateTag } from "../../hooks/tags/use-create-tag";
import { TAG_PALETTE } from "../../lib/constants/colors";
import { resolveTagColor } from "../../lib/utils/color-resolver";
import { UtilitySheet } from "../shared/UtilitySheet";
import { Swatches, TAG_SWATCHES } from "../shared/Swatches";
import { Button } from "../primitives/Button";

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

/** Compact tag picker: a sheet with thumb-sized rows; typing filters, and an unmatched name can be created. */
export function TagPickerSheet({ open, onClose, activeTagIds, onAdd, onRemove }: TagPickerListProps & { open: boolean; onClose: () => void }) {
    const { data: tags = [] } = useTags();
    const createTag = useCreateTag();
    const [query, setQuery] = useState("");
    const [color, setColor] = useState("default");
    const name = query.trim();
    const shown = tags.filter((t) => t.name.toLowerCase().includes(name.toLowerCase()));
    const canCreate = Boolean(name) && !tags.some((t) => t.name.toLowerCase() === name.toLowerCase());

    const create = async () => {
        if (!canCreate || createTag.isPending) return;
        const saved = await createTag.mutateAsync({ name, color });
        setQuery("");
        setColor("default");
        onAdd(saved.id);
    };

    return (
        <UtilitySheet
            title="Tags"
            open={open}
            onClose={() => { setQuery(""); onClose(); }}
            footer={
                <form className="space-y-3 border-t border-twilight-border px-4 py-3" onSubmit={(e) => { e.preventDefault(); void create(); }}>
                    {canCreate ? <Swatches options={TAG_SWATCHES} value={color} onChange={setColor} /> : null}
                    <div className="flex items-center gap-2">
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Find or create a tag"
                            aria-label="Find or create a tag"
                            enterKeyHint="done"
                            className="min-h-12 min-w-0 flex-1 rounded-2xl border border-twilight-border bg-white/[0.04] px-4 text-base text-twilight-text outline-none placeholder:text-twilight-text-muted/80 focus:border-accent-primary/40"
                        />
                        {canCreate ? <Button type="submit" variant="primary" size="md" className="min-h-12" disabled={createTag.isPending}>Create</Button> : null}
                    </div>
                </form>
            }
        >
            {shown.length === 0 ? (
                <p className="py-6 text-center text-sm text-twilight-text-muted/90">{name ? `No tag called “${name}” yet.` : "No tags yet. Type a name below to make one."}</p>
            ) : (
                <ul className="flex flex-col gap-1" aria-label="Tags">
                    {shown.map((tag) => {
                        const active = activeTagIds.includes(tag.id);
                        return (
                            <li key={tag.id}>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={active}
                                    onClick={() => (active ? onRemove(tag.id) : onAdd(tag.id))}
                                    className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 text-left text-[15px] text-twilight-text transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
                                >
                                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: resolveTagColor(tag.color) }} aria-hidden="true" />
                                    <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                                    {active ? <Check size={18} className="text-accent-primary" aria-hidden="true" /> : null}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </UtilitySheet>
    );
}
