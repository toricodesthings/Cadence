import { useState, useMemo, useRef } from "react";
import {
    DndContext, DragOverlay, closestCorners,
    KeyboardSensor, PointerSensor, useSensor, useSensors,
    type DragStartEvent, type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { useInboxSections, useCreateInboxSection, useDeleteInboxSection, useUpdateInboxSection, useUpdateInboxItem } from "../../hooks/inbox";
import { InboxItemCard } from "./InboxItemCard";
import type { InboxItem, InboxSection } from "../../types/inbox";

interface InboxBoardProps {
    items: InboxItem[];
}

function InboxColumn({
    section,
    items,
    onRename,
    onDelete,
}: {
    section: InboxSection | { id: "ungrouped"; name: string };
    items: InboxItem[];
    onRename?: (name: string) => void;
    onDelete?: () => void;
}) {
    const itemIds = useMemo(() => items.map((t) => t.id), [items]);
    const { setNodeRef } = useDroppable({
        id: section.id,
        data: { type: "Column", section },
    });

    const [isRenaming, setIsRenaming] = useState(false);

    return (
        <div className="flex flex-col h-full bg-twilight-backdrop/20 rounded-t-2xl border-x-[1px] border-t-[1px] border-twilight-border/40 min-w-[280px]">
            <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-twilight-border/30 group">
                {isRenaming && onRename ? (
                    <input
                        autoFocus
                        defaultValue={section.name}
                        className="bg-transparent text-[13px] font-display font-medium uppercase tracking-wider text-twilight-text outline-none border-b border-accent-primary/30 w-full"
                        onBlur={(e) => { onRename(e.target.value); setIsRenaming(false); }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { onRename((e.target as HTMLInputElement).value); setIsRenaming(false); }
                            if (e.key === "Escape") setIsRenaming(false);
                        }}
                    />
                ) : (
                    <h3 className="text-[13px] font-display font-medium text-twilight-text-muted/90 uppercase tracking-wider flex items-center gap-2">
                        {section.name}
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-twilight-backdrop/30 text-twilight-text-muted text-[11px] font-mono leading-none border border-twilight-border/40">
                            {items.length}
                        </span>
                    </h3>
                )}

                {section.id !== "ungrouped" && onRename && onDelete && (
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="p-1"
                                    aria-label={`Open actions for section ${section.name}`}
                                >
                                    <MoreHorizontal size={14} />
                                </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content>
                                <DropdownMenu.Item onClick={() => setIsRenaming(true)}>
                                    <Pencil size={14} className="text-twilight-text-muted mr-2" />
                                    Rename
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator />
                                <DropdownMenu.Item onClick={onDelete} className="text-red-400 focus:text-red-400">
                                    <Trash2 size={14} className="mr-2" />
                                    Delete
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    </div>
                )}
            </div>

            <div
                ref={setNodeRef}
                className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin flex flex-col gap-3 min-h-[200px]"
            >
                <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                    {items.map((item) => (
                        <div key={item.id} className="relative z-10 active:z-50 bg-twilight-base p-3 rounded-lg border border-twilight-border shadow-sm">
                            <span className="text-[13px] text-twilight-text">{item.rawText}</span>
                        </div>
                    ))}
                </SortableContext>

                {items.length === 0 && (
                    <div className="h-full flex items-center justify-center text-center p-6 border-2 border-dashed border-twilight-border/30 rounded-xl text-twilight-text-muted/50 text-sm">
                        Drop here
                    </div>
                )}
            </div>
        </div>
    );
}

export function InboxBoard({ items }: InboxBoardProps) {
    const { data: sections = [] } = useInboxSections();
    const createSection = useCreateInboxSection();
    const updateSection = useUpdateInboxSection();
    const deleteSection = useDeleteInboxSection();
    const updateItem = useUpdateInboxItem();

    const [activeItem, setActiveItem] = useState<InboxItem | null>(null);
    const [isAddingColumn, setIsAddingColumn] = useState(false);
    const [newColumnName, setNewColumnName] = useState("");

    const itemsBySection = useMemo(() => {
        const map: Record<string, InboxItem[]> = { ungrouped: [] };
        sections.forEach((s: InboxSection) => {
            map[s.id] = [];
        });
        items.forEach((item) => {
            if (item.sectionId && map[item.sectionId]) {
                map[item.sectionId].push(item);
            } else {
                map.ungrouped.push(item);
            }
        });
        Object.values(map).forEach((arr) => {
            arr.sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
        });
        return map;
    }, [items, sections]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragStart = (e: DragStartEvent) => {
        const active = items.find((i) => i.id === e.active.id);
        if (active) setActiveItem(active);
    };

    const handleDragEnd = (e: DragEndEvent) => {
        setActiveItem(null);
        const { active, over } = e;
        if (!over) return;

        const activeId = active.id;
        const overId = over.id;

        const activeItemData = items.find((i) => i.id === activeId);
        if (!activeItemData) return;

        let newSectionId: string | null = null;

        // Is it dropped over a column?
        if (over.data.current?.type === "Column") {
            const destSectionId = overId === "ungrouped" ? null : String(overId);
            newSectionId = destSectionId;
        } else {
            // Dropped over a card? Find the card's section
            const overItemData = items.find((i) => i.id === overId);
            if (overItemData) {
                newSectionId = overItemData.sectionId;
            }
        }

        // Apply
        if (activeItemData.sectionId !== newSectionId) {
            updateItem.mutate({ id: activeItemData.id, sectionId: newSectionId });
        }
    };

    const handleCreateColumn = () => {
        if (!newColumnName.trim()) {
            setIsAddingColumn(false);
            return;
        }
        createSection.mutate({
            name: newColumnName.trim(),
            orderIndex: sections.length,
        });
        setNewColumnName("");
        setIsAddingColumn(false);
    };

    return (
        <div className="flex h-full w-full gap-4 overflow-x-auto overflow-y-hidden pb-4 px-2 scrollbar-thin">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
            >
                <InboxColumn
                    key="ungrouped"
                    section={{ id: "ungrouped", name: "Uncategorized" }}
                    items={itemsBySection["ungrouped"] || []}
                />

                {sections.map((section: InboxSection) => (
                    <InboxColumn
                        key={section.id}
                        section={section}
                        items={itemsBySection[section.id] || []}
                        onRename={(name) => {
                            if (name.trim()) updateSection.mutate({ id: section.id, name });
                        }}
                        onDelete={() => deleteSection.mutate(section.id)}
                    />
                ))}

                <div className="shrink-0 w-[280px]">
                    {!isAddingColumn ? (
                        <Button
                            variant="ghost"
                            size="md"
                            onClick={() => setIsAddingColumn(true)}
                            className="w-full justify-start py-4 px-5 rounded-t-2xl border border-dashed border-twilight-border/50 bg-white/[0.02]"
                        >
                            <Plus size={16} />
                            <span className="text-[13px] font-display font-medium uppercase tracking-wider">
                                Add Section
                            </span>
                        </Button>
                    ) : (
                        <div className="bg-twilight-backdrop/20 rounded-t-2xl border flex flex-col border-twilight-border/40 p-4 min-w-[280px]">
                            <input
                                autoFocus
                                value={newColumnName}
                                onChange={(e) => setNewColumnName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreateColumn();
                                    if (e.key === "Escape") setIsAddingColumn(false);
                                }}
                                onBlur={handleCreateColumn}
                                placeholder="Section name"
                                className="bg-white/[0.05] border border-twilight-border/50 text-twilight-text text-[13px] font-display font-medium rounded-lg px-3 py-2 outline-none focus:border-accent-primary/50 transition-colors"
                            />
                        </div>
                    )}
                </div>

                <DragOverlay>
                    {activeItem && (
                        <div className="bg-twilight-surface p-3 rounded-lg border border-twilight-border/50 shadow-2xl opacity-80 cursor-grabbing">
                            <span className="text-[13px] text-twilight-text">{activeItem.rawText}</span>
                        </div>
                    )}
                </DragOverlay>
            </DndContext>
        </div>
    );
}
