import { useState, useMemo, useCallback } from "react";
import { EmptyState } from "./EmptyState";
import { ArrowDown, ArrowUp, ChevronRight, Columns3, EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { TaskList } from "../tasks/TaskList";
import { useSections, useCreateSection, useUpdateSection, useDeleteSection } from "../../hooks/sections/use-sections";
import { useSectionReorder } from "../../hooks/sections/use-section-reorder";
import { useSortSensors } from "../../hooks/ui/use-sort-sensors";
import { SortableSection } from "./SortableSection";
import { Reveal } from "../shared/Reveal";
import { AddTaskInput } from "./AddTaskInput";
import { AddSectionControl } from "./AddSectionControl";
import { groupTasksBySection } from "../../lib/utils/task/group-by-section";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useListAccess } from "../../hooks/sharing/use-list-access";
import { Tip } from "../primitives/Tooltip";
import { useDeviceValue } from "../../hooks/ui/use-device-flag";
import { ManageSectionsButton } from "./ProjectSheets";
import type { TaskSection } from "@cadence/contracts/section";
import type { Task } from "@cadence/contracts/task";
import { SPRINGS } from "../../lib/constants/motion";

interface SectionedTaskListProps {
    tasks: Task[];
    projectId?: string | null;
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
    showUngroupedAddTask?: boolean;
    rationaleByTaskId?: Record<string, string | null | undefined>;
    footer?: React.ReactNode;
    onManageSections?: (focus: string) => void;
    hideEmptySections?: boolean;
}

export function SectionedTaskList({
    tasks,
    projectId = null,
    selectedTaskId,
    onSelectTask,
    showUngroupedAddTask = true,
    rationaleByTaskId,
    footer,
    onManageSections,
    hideEmptySections = false,
}: SectionedTaskListProps) {
    const { data: sections = [] } = useSections(projectId);
    const createSection = useCreateSection(projectId);
    const updateSection = useUpdateSection(projectId);
    const deleteSection = useDeleteSection(projectId);
    const shell = useShellMode();
    const access = useListAccess(projectId);
    const reorder = useSectionReorder(projectId, sections);
    const sensors = useSortSensors();
    const inlineAdd = !shell.isCompact && access.canEdit;
    const manageInSheet = shell.isCompact && access.canEdit && onManageSections;
    const addSectionChip = manageInSheet ? (
        <div className="mt-2">
            <ManageSectionsButton wide onClick={() => onManageSections("")} />
        </div>
    ) : null;

    const [foldedRaw, setFoldedRaw] = useDeviceValue("cadence-fold:list-sections");
    const collapsedSections = useMemo(() => {
        try {
            return new Set<string>(foldedRaw ? (JSON.parse(foldedRaw) as string[]) : []);
        } catch {
            return new Set<string>();
        }
    }, [foldedRaw]);
    const [editingSection, setEditingSection] = useState<string | null>(null);

    const ungroupedKey = `ungrouped:${projectId ?? "none"}`;
    const ungroupedFolded = collapsedSections.has(ungroupedKey);

    const toggleCollapse = useCallback(
        (sectionId: string) => {
            const next = new Set(collapsedSections);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            setFoldedRaw(next.size ? JSON.stringify([...next]) : null);
        },
        [collapsedSections, setFoldedRaw],
    );

    const { ungroupedTasks, sectionTaskMap } = useMemo(() => groupTasksBySection(tasks), [tasks]);

    const handleCreateSection = (name: string) => {
        const nextOrder = sections.length > 0 ? Math.max(...sections.map((s) => s.orderIndex)) + 1 : 1;
        createSection.mutate({ name, orderIndex: nextOrder });
    };

    const handleRenameSection = (section: TaskSection, name: string) => {
        if (name.trim() && name.trim() !== section.name) {
            updateSection.mutate({ id: section.id, name: name.trim() });
        }
        setEditingSection(null);
    };

    const hasCustomSections = sections.length > 0;
    const draggable = !manageInSheet && access.canEdit;
    const onSectionDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return;
        reorder.moveTo(
            String(active.data.current?.sectionId),
            sections.findIndex((s) => `section:${s.id}` === over.id),
        );
    };

    if (!hasCustomSections) {
        return (
            <div className={`flex flex-col gap-1 ${shell.isCompact ? "surface-card rounded-[30px] px-3 py-4" : ""}`}>
                <TaskList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    rationaleByTaskId={rationaleByTaskId}
                />

                {inlineAdd && <AddSectionControl onCreate={handleCreateSection} />}
                {addSectionChip}

                {footer}
            </div>
        );
    }

    const sectionSurfaceClass = shell.isCompact ? "mt-2" : "";
    const titleClass = shell.isCompact
        ? "text-[12px] font-semibold uppercase tracking-[0.18em] text-twilight-text"
        : "text-[13px] font-display font-semibold uppercase tracking-[0.16em] text-twilight-text";
    const lineClass = shell.isCompact
        ? "h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent"
        : "flex-1 h-px bg-gradient-to-r from-twilight-border/20 to-transparent";
    const sectionIcon = shell.isCompact ? (
        <Columns3 size={14} aria-hidden="true" className="shrink-0 text-twilight-text-soft" />
    ) : null;
    const inlineAddClass = shell.isCompact ? "mt-3" : "mt-2";
    const Block = draggable ? SortableSection : PlainSection;
    const wrapSections = (blocks: React.ReactNode) =>
        draggable ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSectionDragEnd}>
                <SortableContext items={sections.map((s) => `section:${s.id}`)} strategy={verticalListSortingStrategy}>
                    {blocks}
                </SortableContext>
            </DndContext>
        ) : (
            blocks
        );

    return (
        <div className={`flex flex-col gap-3 ${shell.isCompact ? "pb-2" : "gap-1"}`}>
            {(ungroupedTasks.length > 0 || hasCustomSections) && (
                <Reveal open={!(hideEmptySections && ungroupedTasks.length === 0)}>
                    <div className={shell.isCompact ? sectionSurfaceClass : "mt-4"}>
                        <div className="flex items-center gap-2 group">
                            <Tip label={ungroupedFolded ? "Expand" : "Collapse"}>
                                <button
                                    type="button"
                                    onClick={() => toggleCollapse(ungroupedKey)}
                                    className="flex min-w-0 items-center gap-2 py-1.5 text-left cursor-pointer"
                                    aria-expanded={!ungroupedFolded}
                                >
                                    <ChevronRight
                                        size={14}
                                        aria-hidden="true"
                                        className={`shrink-0 text-twilight-text-soft transition-transform duration-200 motion-reduce:transition-none ${ungroupedFolded ? "" : "rotate-90"}`}
                                    />
                                    {sectionIcon}
                                    <span className={titleClass}>Unsectioned</span>
                                    <span className="text-[12px] text-twilight-text-soft/90 tabular-nums">
                                        {ungroupedTasks.length}
                                    </span>
                                </button>
                            </Tip>

                            <div className={lineClass} />
                        </div>
                        <Reveal open={!ungroupedFolded}>
                            <TaskList
                                className="mt-4"
                                tasks={ungroupedTasks}
                                selectedTaskId={selectedTaskId}
                                onSelectTask={onSelectTask}
                                rationaleByTaskId={rationaleByTaskId}
                            />
                            {showUngroupedAddTask && inlineAdd ? (
                                <div className={inlineAddClass}>
                                    <AddTaskInput
                                        projectId={projectId ?? undefined}
                                        tasks={ungroupedTasks}
                                        compact
                                        placeholder="Add unsectioned task..."
                                    />
                                </div>
                            ) : null}
                        </Reveal>
                    </div>
                </Reveal>
            )}

            {wrapSections(
                sections.map((section, index) => {
                    const sectionTasks = sectionTaskMap.get(section.id) ?? [];
                    const isCollapsed = collapsedSections.has(section.id);
                    const isEditing = editingSection === section.id;

                    return (
                        <Reveal key={section.id} open={!(hideEmptySections && sectionTasks.length === 0)}>
                            <Block
                                id={section.id}
                                name={section.name}
                                className={shell.isCompact ? sectionSurfaceClass : "mt-4"}
                            >
                                {(grip) => (
                                    <>
                                        <div className="flex items-center gap-2 group">
                                            {grip ? <span className="-ml-2 -mr-0.5 flex">{grip}</span> : null}
                                            <Tip label={isCollapsed ? "Expand" : "Collapse"}>
                                                <button
                                                    type="button"
                                                    onClick={() => toggleCollapse(section.id)}
                                                    className="flex min-w-0 items-center gap-2 py-1.5 text-left cursor-pointer"
                                                    aria-expanded={!isCollapsed}
                                                >
                                                    <ChevronRight
                                                        size={14}
                                                        aria-hidden="true"
                                                        className={`shrink-0 text-twilight-text-soft transition-transform duration-200 motion-reduce:transition-none ${isCollapsed ? "" : "rotate-90"}`}
                                                    />
                                                    {sectionIcon}
                                                    {isEditing ? (
                                                        <input
                                                            autoFocus
                                                            defaultValue={section.name}
                                                            className="bg-transparent text-[12px] font-display font-medium uppercase tracking-wider text-twilight-text outline-none border-b border-accent-primary/30 px-1 -mx-1"
                                                            onBlur={(e) => handleRenameSection(section, e.target.value)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter")
                                                                    handleRenameSection(
                                                                        section,
                                                                        (e.target as HTMLInputElement).value,
                                                                    );
                                                                if (e.key === "Escape") setEditingSection(null);
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    ) : (
                                                        <span className={titleClass}>{section.name}</span>
                                                    )}
                                                    <span className="text-[12px] text-twilight-text-soft/90 tabular-nums">
                                                        {sectionTasks.length}
                                                    </span>
                                                </button>
                                            </Tip>

                                            <div className={lineClass} />

                                            {access.canEdit && (
                                                <SectionMenu
                                                    canDelete={access.isOwner}
                                                    section={section}
                                                    compact={shell.isCompact}
                                                    onManage={manageInSheet || undefined}
                                                    onRename={() => setEditingSection(section.id)}
                                                    onDelete={() =>
                                                        deleteSection.mutate({ id: section.id, name: section.name })
                                                    }
                                                    onMove={(by) => reorder.move(section.id, by)}
                                                    first={index === 0}
                                                    last={index === sections.length - 1}
                                                />
                                            )}
                                        </div>

                                        <AnimatePresence initial={false}>
                                            {!isCollapsed && (
                                                <SectionTasks
                                                    section={section}
                                                    tasks={sectionTasks}
                                                    projectId={projectId}
                                                    inlineAdd={inlineAdd}
                                                    inlineAddClass={inlineAddClass}
                                                    selectedTaskId={selectedTaskId}
                                                    onSelectTask={onSelectTask}
                                                    rationaleByTaskId={rationaleByTaskId}
                                                />
                                            )}
                                        </AnimatePresence>
                                    </>
                                )}
                            </Block>
                        </Reveal>
                    );
                }),
            )}

            {inlineAdd && <AddSectionControl onCreate={handleCreateSection} />}
            {addSectionChip}

            {footer}
        </div>
    );
}

function PlainSection({
    className,
    children,
}: {
    id: string;
    name: string;
    className?: string;
    children: (grip: React.ReactNode) => React.ReactNode;
}) {
    return <div className={className}>{children(null)}</div>;
}

type SectionMenuProps = {
    section: TaskSection;
    canDelete: boolean;
    compact: boolean;
    onManage?: (focus: string) => void;
    onRename: () => void;
    onDelete: () => void;
    onMove: (by: -1 | 1) => void;
    first: boolean;
    last: boolean;
};

function SectionMenu({
    section,
    canDelete,
    compact,
    onManage,
    onRename,
    onDelete,
    onMove,
    first,
    last,
}: SectionMenuProps) {
    if (onManage) {
        return (
            <Tip label="Edit section">
                <button
                    type="button"
                    onClick={() => onManage(section.id)}
                    className="mobile-icon-button glass-inset ml-auto shrink-0"
                    aria-label={`Edit section ${section.name}`}
                >
                    <EllipsisVertical size={18} aria-hidden="true" />
                </button>
            </Tip>
        );
    }
    return (
        <div
            className={`ml-auto shrink-0 ${compact ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-100"}`}
        >
            <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="p-1"
                        aria-label={`Open actions for section ${section.name}`}
                    >
                        <EllipsisVertical size={14} />
                    </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content>
                    <DropdownMenu.Item onClick={onRename}>
                        <Pencil size={14} className="text-twilight-text-muted" />
                        Rename
                    </DropdownMenu.Item>
                    <DropdownMenu.Item disabled={first} onSelect={() => onMove(-1)}>
                        <ArrowUp size={14} className="text-twilight-text-muted" />
                        Move up
                    </DropdownMenu.Item>
                    <DropdownMenu.Item disabled={last} onSelect={() => onMove(1)}>
                        <ArrowDown size={14} className="text-twilight-text-muted" />
                        Move down
                    </DropdownMenu.Item>
                    {canDelete && (
                        <>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item onClick={onDelete} className="text-red-400 focus:text-red-400">
                                <Trash2 size={14} />
                                Delete section
                            </DropdownMenu.Item>
                        </>
                    )}
                </DropdownMenu.Content>
            </DropdownMenu.Root>
        </div>
    );
}

type SectionTasksProps = Pick<SectionedTaskListProps, "selectedTaskId" | "onSelectTask" | "rationaleByTaskId"> & {
    section: TaskSection;
    tasks: Task[];
    projectId: string | null;
    inlineAdd: boolean;
    inlineAddClass: string;
};

function SectionTasks({
    section,
    tasks,
    projectId,
    inlineAdd,
    inlineAddClass,
    selectedTaskId,
    onSelectTask,
    rationaleByTaskId,
}: SectionTasksProps) {
    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRINGS.GLIDE}
            className="overflow-hidden"
        >
            {tasks.length > 0 ? (
                <TaskList
                    className="mt-4"
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    rationaleByTaskId={rationaleByTaskId}
                />
            ) : (
                <EmptyState title="Nothing in this section yet." description={null} compact />
            )}
            {inlineAdd && (
                <div className={inlineAddClass}>
                    <AddTaskInput
                        projectId={projectId ?? undefined}
                        sectionId={section.id}
                        tasks={tasks}
                        compact
                        placeholder={`Add task to ${section.name}...`}
                    />
                </div>
            )}
        </motion.div>
    );
}
