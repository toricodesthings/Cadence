import { useState, useMemo, useRef, useEffect } from "react";
import {
    DndContext, DragOverlay, closestCorners,
    KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useSections, useCreateSection, useDeleteSection, useUpdateSection } from "../../hooks/sections";
import { useSubtasksByTaskIds } from "../../hooks/tasks/use-subtasks";
import { useUpdateTask } from "../../hooks/tasks";
import { useTags } from "../../hooks/tags";
import { SortableTaskCard } from "../tasks/SortableTaskCard";
import { TaskCard } from "../tasks/TaskCard";
import { TaskContextMenuWrapper } from "../tasks/TaskContextMenuWrapper";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { useDragScroll } from "../../hooks/ui/use-drag-scroll";
import type { Task, TaskSection, Subtask } from "../../types/task";
import type { Tag } from "../../types/tag";

interface KanbanBoardProps {
    tasks: Task[];
    projectId?: string | null;
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
}

/** A single column (droppable zone) in the Kanban board */
function KanbanColumn({
    section,
    tasks,
    subtasksByTaskId,
    tagsByTaskId,
    selectedTaskId,
    onSelectTask,
    onRename,
    onDelete,
}: {
    section: TaskSection | { id: "ungrouped"; name: string };
    tasks: Task[];
    subtasksByTaskId: Record<string, Subtask[]>;
    tagsByTaskId: Record<string, Tag[]>;
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
    onRename?: (name: string) => void;
    onDelete?: () => void;
}) {
    const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
    const { setNodeRef } = useDroppable({
        id: section.id,
        data: { type: "Column", section },
    });

    const [isRenaming, setIsRenaming] = useState(false);

    return (
        <div className="flex flex-col h-full bg-twilight-backdrop/20 rounded-t-2xl border-x-[1px] border-t-[1px] border-twilight-border/40 min-w-[280px]">
            {/* Header */}
            <div className="relative flex items-center px-5 py-4 shrink-0 border-b border-twilight-border/30 group">
                {isRenaming && onRename ? (
                    <input
                        autoFocus
                        defaultValue={section.name}
                        className="bg-transparent text-[13px] font-display font-medium uppercase tracking-wider text-twilight-text outline-none border-b border-lantern/30"
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
                            {tasks.length}
                        </span>
                    </h3>
                )}

                {section.id !== "ungrouped" && onRename && onDelete && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="p-1"
                                    aria-label={`Open actions for column ${section.name}`}
                                >
                                    <MoreVertical size={14} />
                                </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end" sideOffset={4}>
                                <DropdownMenu.Item onClick={() => setIsRenaming(true)}>
                                    <Pencil size={14} className="text-twilight-text-muted mr-2 shrink-0" />
                                    Rename
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator />
                                <DropdownMenu.Item onClick={onDelete} className="text-red-400 focus:text-red-400">
                                    <Trash2 size={14} className="mr-2 shrink-0" />
                                    Delete
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    </div>
                )}
            </div>

            {/* Droppable card area */}
            <div
                ref={setNodeRef}
                className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin flex flex-col gap-3 min-h-[200px]"
            >
                <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                    {tasks.map((task) => (
                        <TaskContextMenuWrapper key={task.id} task={task}>
                            <SortableTaskCard
                                task={task}
                                tags={tagsByTaskId[task.id] ?? []}
                                subtasks={subtasksByTaskId[task.id] ?? []}
                                isSelected={task.id === selectedTaskId}
                                onSelect={onSelectTask || (() => { })}
                                variant="board"
                            />
                        </TaskContextMenuWrapper>
                    ))}
                </SortableContext>

                {tasks.length === 0 && (
                    <div className="h-full flex items-center justify-center text-center p-6 border-2 border-dashed border-twilight-border/30 rounded-xl text-twilight-text-muted/50 text-sm">
                        Drop here
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Kanban Board — columns are user-defined TaskSections.
 *
 * This is NOT a separate page. It's a view mode activated by `?view=kanban`.
 * Dragging a card between columns changes its `sectionId`.
 */
export function KanbanBoard({ tasks, projectId = null, selectedTaskId = null, onSelectTask = () => { } }: KanbanBoardProps) {
    const { data: sections = [] } = useSections(projectId);
    const createSection = useCreateSection(projectId);
    const updateSection = useUpdateSection(projectId);
    const deleteSection = useDeleteSection(projectId);
    const updateTask = useUpdateTask();

    const [activeTask, setActiveTask] = useState<Task | null>(null);
    const [isAddingColumn, setIsAddingColumn] = useState(false);
    const [newColumnName, setNewColumnName] = useState("");
    const dragScroll = useDragScroll();
    const scrollContainerRef = dragScroll.ref;
    const addColumnRef = useRef<HTMLDivElement>(null);
    const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
    const { data: subtasksByTaskId = {} } = useSubtasksByTaskIds(taskIds);
    const { data: allTags = [] } = useTags();

    const tagsByTaskId = useMemo(() => {
        const tagsById = new Map(allTags.map((t) => [t.id, t] as const));
        return tasks.reduce<Record<string, Tag[]>>((acc, task) => {
            acc[task.id] = (task.tagIds ?? []).map((id) => tagsById.get(id)).filter((t): t is Tag => Boolean(t));
            return acc;
        }, {});
    }, [allTags, tasks]);

    // Scroll to the new "add column" area when entering add mode
    useEffect(() => {
        if (isAddingColumn && addColumnRef.current) {
            addColumnRef.current.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
        }
    }, [isAddingColumn]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor),
    );

    // Group tasks by sectionId
    const { ungroupedTasks, sectionTaskMap } = useMemo(() => {
        const ungrouped: Task[] = [];
        const map = new Map<string, Task[]>();

        for (const task of tasks) {
            if (!task.sectionId) {
                ungrouped.push(task);
            } else {
                const list = map.get(task.sectionId) || [];
                list.push(task);
                map.set(task.sectionId, list);
            }
        }

        return { ungroupedTasks: ungrouped, sectionTaskMap: map };
    }, [tasks]);

    const handleDragStart = (e: DragStartEvent) => {
        const task = tasks.find((t) => t.id === e.active.id);
        if (task) setActiveTask(task);
    };

    const handleDragEnd = (e: DragEndEvent) => {
        setActiveTask(null);
        const { active, over } = e;
        if (!over || active.id === over.id) return;

        const taskId = active.id as string;
        const overData = over.data.current;

        const draggedTask = tasks.find((t) => t.id === taskId);
        if (!draggedTask) return;

        let targetSectionId: string | null = draggedTask.sectionId || null;
        let newOrderIndex = draggedTask.orderIndex || 0;
        let shouldUpdate = false;

        if (overData?.type === "Column") {
            const newSectionId = overData.section.id === "ungrouped" ? null : overData.section.id;
            targetSectionId = newSectionId;
            const targetTasks = (targetSectionId ? sectionTaskMap.get(targetSectionId) : ungroupedTasks) || [];
            newOrderIndex = targetTasks.length > 0
                ? Math.max(...targetTasks.map(t => t.orderIndex || 0)) + 1000
                : 1000;

            if (draggedTask.sectionId !== targetSectionId) {
                shouldUpdate = true;
            }
        } else {
            // Dropped on a card
            const overTask = tasks.find((t) => t.id === over.id);
            if (overTask) {
                targetSectionId = overTask.sectionId || null;
                const targetTasks = (targetSectionId ? sectionTaskMap.get(targetSectionId) : ungroupedTasks) || [];
                const sortedTasks = [...targetTasks].sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
                const overIndex = sortedTasks.findIndex(t => t.id === over.id);

                const activeRect = active.rect.current.translated;
                const isBelow = activeRect && activeRect.top > over.rect.top + (over.rect.height / 2);

                if (isBelow) {
                    const prevOrder = overTask.orderIndex || 0;
                    const nextTask = sortedTasks[overIndex + 1];
                    const nextOrder = nextTask ? (nextTask.orderIndex || prevOrder + 2000) : prevOrder + 2000;
                    newOrderIndex = (prevOrder + nextOrder) / 2;
                } else {
                    const nextOrder = overTask.orderIndex || 0;
                    const prevTask = sortedTasks[overIndex - 1];
                    const prevOrder = prevTask ? (prevTask.orderIndex || nextOrder - 2000) : nextOrder - 2000;
                    newOrderIndex = (prevOrder + nextOrder) / 2;
                }

                if (draggedTask.sectionId !== targetSectionId || Math.abs(draggedTask.orderIndex - newOrderIndex) > 0.001) {
                    shouldUpdate = true;
                }
            }
        }

        if (shouldUpdate) {
            updateTask.mutate({ id: taskId, sectionId: targetSectionId, orderIndex: newOrderIndex });
        }
    };

    const handleCreateColumn = () => {
        const name = newColumnName.trim();
        if (!name) return;
        const nextOrder = sections.length > 0
            ? Math.max(...sections.map((s) => s.orderIndex)) + 1
            : 1;
        createSection.mutate({ name, orderIndex: nextOrder }, {
            onSuccess: () => {
                // After optimistic insert, scroll to show the new column
                requestAnimationFrame(() => {
                    if (addColumnRef.current) {
                        addColumnRef.current.scrollIntoView({ behavior: "smooth", inline: "end", block: "nearest" });
                    }
                });
            },
        });
        setNewColumnName("");
        setIsAddingColumn(false);
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div
                ref={scrollContainerRef}
                className="overflow-x-auto overflow-y-auto h-full flex-1 min-h-0 scrollbar-thin cursor-grab"
                onPointerDown={dragScroll.onPointerDown}
                onPointerMove={dragScroll.onPointerMove}
                onPointerUp={dragScroll.onPointerUp}
                onPointerCancel={dragScroll.onPointerCancel}
            >
                <div className="flex gap-4 px-4 py-4 h-full min-h-full items-stretch">
                {/* Unsectioned column (always first) */}
                {(ungroupedTasks.length > 0 || sections.length > 0) && (
                    <div className="w-[min(24rem,80vw)] shrink-0">
                        <KanbanColumn
                            section={{ id: "ungrouped", name: "Unsectioned" }}
                            tasks={ungroupedTasks}
                            subtasksByTaskId={subtasksByTaskId}
                            tagsByTaskId={tagsByTaskId}
                            selectedTaskId={selectedTaskId}
                            onSelectTask={onSelectTask}
                        />
                    </div>
                )}

                {/* Section columns */}
                {sections.map((section) => (
                    <div key={section.id} className="w-[min(24rem,80vw)] shrink-0">
                        <KanbanColumn
                            section={section}
                            tasks={sectionTaskMap.get(section.id) || []}
                            subtasksByTaskId={subtasksByTaskId}
                            tagsByTaskId={tagsByTaskId}
                            selectedTaskId={selectedTaskId}
                            onSelectTask={onSelectTask}
                            onRename={(name) => updateSection.mutate({ id: section.id, name })}
                            onDelete={() => deleteSection.mutate(section.id)}
                        />
                    </div>
                ))}

                {/* Add column button */}
                <div ref={addColumnRef} className="w-[min(20rem,70vw)] shrink-0">
                    {isAddingColumn ? (
                        <div className="bg-twilight-backdrop/20 rounded-2xl border border-twilight-border/40 p-4">
                            <input
                                autoFocus
                                value={newColumnName}
                                onChange={(e) => setNewColumnName(e.target.value)}
                                placeholder="Section name..."
                                className="w-full bg-transparent text-[13px] text-twilight-text outline-none border-b border-twilight-border/40 pb-2 placeholder:text-twilight-text-muted/40"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreateColumn();
                                    if (e.key === "Escape") { setIsAddingColumn(false); setNewColumnName(""); }
                                }}
                                onBlur={() => {
                                    if (newColumnName.trim()) handleCreateColumn();
                                    else { setIsAddingColumn(false); setNewColumnName(""); }
                                }}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsAddingColumn(true)}
                            className="w-full h-[60px] rounded-2xl border-2 border-dashed border-twilight-border/30 flex items-center justify-center gap-2 text-[13px] text-twilight-text-muted/50 hover:text-twilight-text-muted hover:border-twilight-border/50 transition-colors cursor-pointer"
                        >
                            <Plus size={16} />
                            Add section
                        </button>
                    )}
                </div>
                </div>
            </div>

            <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
                {activeTask ? (
                    <TaskCard
                        task={activeTask}
                        tags={tagsByTaskId[activeTask.id] ?? []}
                        subtasks={subtasksByTaskId[activeTask.id] ?? []}
                        onSelect={onSelectTask}
                        isSelected={activeTask.id === selectedTaskId}
                        variant="board"
                        isDragging
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
