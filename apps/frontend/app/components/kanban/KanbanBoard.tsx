import { useState, useMemo, useRef, useEffect } from "react";
import {
    DndContext, DragOverlay, closestCorners,
    KeyboardSensor, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragStartEvent, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useSections, useCreateSection, useDeleteSection, useUpdateSection } from "../../hooks/sections";
import { useSubtasksByTaskIds } from "../../hooks/tasks/use-subtasks";
import { useUpdateTask } from "../../hooks/tasks";
import { useTags } from "../../hooks/tags";
import { SortableTaskCard } from "../tasks/SortableTaskCard";
import { AddTaskInput } from "../tasks/AddTaskInput";
import { TaskList } from "../tasks/TaskList";
import { TaskCard } from "../tasks/TaskCard";
import { TaskContextMenuWrapper } from "../tasks/TaskContextMenuWrapper";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { useDragScroll } from "../../hooks/ui/use-drag-scroll";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { Task, TaskSection, Subtask } from "../../types/task";
import type { Tag } from "../../types/tag";
import { BoardCanvas } from "../shared/BoardCanvas";

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
    projectId,
}: {
    section: TaskSection | { id: "ungrouped"; name: string };
    tasks: Task[];
    subtasksByTaskId: Record<string, Subtask[]>;
    tagsByTaskId: Record<string, Tag[]>;
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
    onRename?: (name: string) => void;
    onDelete?: () => void;
    projectId?: string | null;
}) {
    const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
    const { setNodeRef } = useDroppable({
        id: section.id,
        data: { type: "Column", section },
    });

    const [isRenaming, setIsRenaming] = useState(false);

    return (
        <div className="flex flex-col h-full rounded-[28px] border border-twilight-border/45 bg-twilight-surface/20 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-xl min-w-[280px]">
            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 border-b border-twilight-border/30 px-5 py-4 group">
                {isRenaming && onRename ? (
                    <input
                        autoFocus
                        defaultValue={section.name}
                        className="border-b border-lantern/30 bg-transparent font-display text-base font-semibold text-twilight-text outline-none"
                        onBlur={(e) => { onRename(e.target.value); setIsRenaming(false); }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") { onRename((e.target as HTMLInputElement).value); setIsRenaming(false); }
                            if (e.key === "Escape") setIsRenaming(false);
                        }}
                    />
                ) : (
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="truncate font-display text-base font-semibold text-twilight-text">
                                {section.name}
                            </h3>
                            <span className="rounded-full border border-twilight-border/40 bg-white/[0.03] px-2.5 py-0.5 text-[11px] tabular-nums text-twilight-text-soft">
                                {tasks.length}
                            </span>
                        </div>
                    </div>
                )}

                <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                    {((section.id !== "ungrouped" && onRename && onDelete) || (section.id === "ungrouped" && tasks.length === 0 && onDelete)) ? (
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button
                                    type="button"
                                    className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-twilight-text-muted opacity-0 transition-[opacity,color,background-color] group-hover:opacity-100 hover:bg-white/[0.05] hover:text-twilight-text focus-visible:opacity-100"
                                    aria-label={`Open actions for column ${section.name}`}
                                >
                                    <MoreHorizontal size={14} aria-hidden="true" />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end" sideOffset={4}>
                                {section.id !== "ungrouped" && (<>
                                <DropdownMenu.Item onClick={() => setIsRenaming(true)}>
                                    <Pencil size={14} className="text-twilight-text-muted mr-2 shrink-0" />
                                    Rename
                                </DropdownMenu.Item>
                                <DropdownMenu.Separator />
                                </>
                                )}
                                <DropdownMenu.Item onClick={onDelete} className="text-red-400 focus:text-red-400">
                                    <Trash2 size={14} className="mr-2 shrink-0" />
                                    Delete
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    ) : null}
                </div>
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

            {/* Footer / Add task area */}
            <div className="px-3 py-3 shrink-0 border-t border-twilight-border/30">
                <AddTaskInput
                    projectId={projectId || undefined}
                    sectionId={section.id === "ungrouped" ? undefined : section.id}
                    tasks={tasks}
                    compact={true}
                />
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
    const shell = useShellMode();
    const { data: sections = [] } = useSections(projectId);
    const createSection = useCreateSection(projectId);
    const updateSection = useUpdateSection(projectId);
    const deleteSection = useDeleteSection(projectId);
    const updateTask = useUpdateTask();

    const [activeTask, setActiveTask] = useState<Task | null>(null);
    const [isAddingColumn, setIsAddingColumn] = useState(false);
    const [isUnsectionedHidden, setIsUnsectionedHidden] = useState(false);
    const [activeSectionId, setActiveSectionId] = useState<string>("ungrouped");
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

    const visibleColumns = useMemo(() => {
        const columns: Array<{
            id: string;
            name: string;
            tasks: Task[];
            section: TaskSection | { id: "ungrouped"; name: string };
        }> = [];

        if (!(isUnsectionedHidden && ungroupedTasks.length === 0) && (ungroupedTasks.length > 0 || sections.length > 0)) {
            columns.push({
                id: "ungrouped",
                name: "Unsectioned",
                tasks: ungroupedTasks,
                section: { id: "ungrouped", name: "Unsectioned" },
            });
        }

        for (const section of sections) {
            columns.push({
                id: section.id,
                name: section.name,
                tasks: sectionTaskMap.get(section.id) || [],
                section,
            });
        }

        return columns;
    }, [isUnsectionedHidden, sections, sectionTaskMap, ungroupedTasks]);

    useEffect(() => {
        if (visibleColumns.length === 0) {
            setActiveSectionId("ungrouped");
            return;
        }

        if (!visibleColumns.some((column) => column.id === activeSectionId)) {
            setActiveSectionId(visibleColumns[0].id);
        }
    }, [activeSectionId, visibleColumns]);

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

    if (shell.isCompact) {
        return (
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
                <BoardCanvas
                    columns={visibleColumns.map((column) => ({
                        id: column.id,
                        title: column.name,
                        count: column.tasks.length,
                        description: "Focus one section at a time",
                        content: (
                            <TaskList
                                tasks={column.tasks}
                                selectedTaskId={selectedTaskId}
                                onSelectTask={onSelectTask}
                                cardVariant="board"
                            />
                        ),
                        footer: (
                            <AddTaskInput
                                projectId={projectId || undefined}
                                sectionId={column.id === "ungrouped" ? undefined : column.id}
                                tasks={column.tasks}
                                compact
                                placeholder={`Add task to ${column.name}...`}
                            />
                        ),
                    }))}
                />

                <div ref={addColumnRef}>
                    {isAddingColumn ? (
                        <div className="rounded-[24px] border border-twilight-border/40 bg-twilight-surface/20 px-4 py-4 backdrop-blur-xl">
                            <input
                                autoFocus
                                value={newColumnName}
                                onChange={(e) => setNewColumnName(e.target.value)}
                                placeholder="Section name..."
                                className="w-full border-b border-twilight-border/40 bg-transparent pb-2 text-[13px] text-twilight-text outline-none placeholder:text-twilight-text-muted/40"
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
                            className="touch-target flex min-h-12 w-full items-center justify-center gap-2 rounded-[24px] border border-dashed border-twilight-border/40 bg-white/[0.02] text-sm font-medium text-twilight-text-soft"
                        >
                            <Plus size={16} />
                            Add section
                        </button>
                    )}
                </div>
            </div>
        );
    }

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
                {visibleColumns.filter((column) => column.id === "ungrouped").map((column) => (
                    <div key={column.id} className="w-[min(24rem,80vw)] shrink-0">
                        <KanbanColumn
                            section={column.section}
                            tasks={column.tasks}
                            subtasksByTaskId={subtasksByTaskId}
                            tagsByTaskId={tagsByTaskId}
                            selectedTaskId={selectedTaskId}
                            projectId={projectId}
                            onSelectTask={onSelectTask}
                            onDelete={() => setIsUnsectionedHidden(true)}
                        />
                    </div>
                ))}

                {/* Section columns */}
                {visibleColumns.filter((column) => column.id !== "ungrouped").map((column) => (
                    <div key={column.id} className="w-[min(24rem,80vw)] shrink-0">
                        <KanbanColumn
                            section={column.section}
                            tasks={column.tasks}
                            subtasksByTaskId={subtasksByTaskId}
                            tagsByTaskId={tagsByTaskId}
                            selectedTaskId={selectedTaskId}
                            projectId={projectId}
                            onSelectTask={onSelectTask}
                            onRename={(name) => updateSection.mutate({ id: column.id, name })}
                            onDelete={() => deleteSection.mutate(column.id)}
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
