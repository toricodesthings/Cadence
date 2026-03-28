import { useState, useMemo, useRef, useCallback } from "react";
import { ChevronDown, ChevronRight, Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { TaskList } from "../tasks/TaskList";
import { useSections, useCreateSection, useUpdateSection, useDeleteSection } from "../../hooks/sections";
import { AddTaskInput } from "./AddTaskInput";
import * as DropdownMenu from "../primitives/DropdownMenu";
import { Button } from "../primitives/Button";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import type { Task, TaskSection } from "../../types/task";

interface SectionedTaskListProps {
    tasks: Task[];
    projectId?: string | null;
    selectedTaskId?: string | null;
    onSelectTask?: (id: string) => void;
    showUngroupedAddTask?: boolean;
    rationaleByTaskId?: Record<string, string | null | undefined>;
    /** Additional content to render at the end */
    footer?: React.ReactNode;
}

/**
 * Task list with user-defined collapsible section headers.
 * Until the user creates a section, tasks stay in one normalized list.
 * Once sections exist, tasks without a sectionId render under "Unsectioned".
 */
export function SectionedTaskList({
    tasks,
    projectId = null,
    selectedTaskId,
    onSelectTask,
    showUngroupedAddTask = true,
    rationaleByTaskId,
    footer,
}: SectionedTaskListProps) {
    const { data: sections = [] } = useSections(projectId);
    const createSection = useCreateSection(projectId);
    const updateSection = useUpdateSection(projectId);
    const deleteSection = useDeleteSection(projectId);
    const shell = useShellMode();

    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
    const [editingSection, setEditingSection] = useState<string | null>(null);
    const [newSectionName, setNewSectionName] = useState("");
    const [isAddingSection, setIsAddingSection] = useState(false);
    const newSectionInputRef = useRef<HTMLInputElement>(null);

    const toggleCollapse = useCallback((sectionId: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionId)) next.delete(sectionId);
            else next.add(sectionId);
            return next;
        });
    }, []);

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

    const handleCreateSection = () => {
        if (!newSectionName.trim()) return;
        const nextOrder = sections.length > 0
            ? Math.max(...sections.map((s) => s.orderIndex)) + 1
            : 1;
        createSection.mutate({ name: newSectionName.trim(), orderIndex: nextOrder });
        setNewSectionName("");
        setIsAddingSection(false);
    };

    const handleRenameSection = (section: TaskSection, name: string) => {
        if (name.trim() && name.trim() !== section.name) {
            updateSection.mutate({ id: section.id, name: name.trim() });
        }
        setEditingSection(null);
    };

    const hasCustomSections = sections.length > 0;

    if (!hasCustomSections) {
        return (
            <div className={`flex flex-col gap-1 ${shell.isCompact ? "rounded-[30px] border border-twilight-border/45 bg-twilight-surface/20 px-3 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.16)] backdrop-blur-xl" : ""}`}>
                <TaskList
                    tasks={tasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    rationaleByTaskId={rationaleByTaskId}
                />

                <div className="mt-4">
                    {isAddingSection ? (
                        <div className="flex items-center gap-2 px-4">
                            <input
                                ref={newSectionInputRef}
                                autoFocus
                                value={newSectionName}
                                onChange={(e) => setNewSectionName(e.target.value)}
                                placeholder="Section name..."
                                className="flex-1 bg-transparent text-[13px] text-twilight-text outline-none border-b border-twilight-border/40 pb-1 placeholder:text-twilight-text-muted/40"
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleCreateSection();
                                    if (e.key === "Escape") {
                                        setIsAddingSection(false);
                                        setNewSectionName("");
                                    }
                                }}
                                onBlur={() => {
                                    if (newSectionName.trim()) handleCreateSection();
                                    else {
                                        setIsAddingSection(false);
                                        setNewSectionName("");
                                    }
                                }}
                            />
                        </div>
                    ) : (
                        <button
                            type="button"
                            data-add-section-trigger
                            onClick={() => setIsAddingSection(true)}
                            className="flex items-center gap-2 text-[12px] text-twilight-text-muted/50 hover:text-twilight-text-muted transition-colors cursor-pointer px-4 py-2"
                        >
                            <Plus size={14} />
                            Add section
                        </button>
                    )}
                </div>

                {footer}
            </div>
        );
    }

    const sectionSurfaceClass = shell.isCompact
        ? "rounded-[28px] border border-twilight-border/45 bg-twilight-surface/20 px-3 py-3 shadow-[0_24px_80px_rgba(0,0,0,0.16)] backdrop-blur-xl"
        : "";
    const inlineAddClass = shell.isCompact ? "mt-3" : "mt-2";

    return (
        <div className={`flex flex-col gap-3 ${shell.isCompact ? "pb-2" : "gap-1"}`}>
            {/* Unsectioned tasks (no section) */}
            {(ungroupedTasks.length > 0 || hasCustomSections) && (
                <div className={`${shell.isCompact ? sectionSurfaceClass : "mt-4"}`}>
                    <div className="flex items-center gap-2 group">
                        <div className="flex items-center gap-2 flex-1 py-1.5 text-left">
                            <span className="text-[13px] font-display font-semibold uppercase tracking-[0.16em] text-twilight-text">
                                Unsectioned
                            </span>
                            <span className="text-[12px] text-twilight-text-soft/90 tabular-nums">
                                {ungroupedTasks.length}
                            </span>
                        </div>

                        <div className="flex-1 h-px bg-gradient-to-r from-twilight-border/20 to-transparent" />
                    </div>
                    <TaskList
                        tasks={ungroupedTasks}
                        selectedTaskId={selectedTaskId}
                        onSelectTask={onSelectTask}
                        rationaleByTaskId={rationaleByTaskId}
                    />
                    {showUngroupedAddTask ? (
                        <div className={inlineAddClass}>
                            <AddTaskInput
                                projectId={projectId ?? undefined}
                                tasks={ungroupedTasks}
                                compact
                                placeholder="Add unsectioned task..."
                            />
                        </div>
                    ) : null}
                </div>
            )}

            {/* User-defined sections */}
            {sections.map((section) => {
                const sectionTasks = sectionTaskMap.get(section.id) || [];
                const isCollapsed = collapsedSections.has(section.id);
                const isEditing = editingSection === section.id;

                return (
                    <div key={section.id} className={shell.isCompact ? sectionSurfaceClass : "mt-4"}>
                        {/* Section header */}
                        <div className="flex items-center gap-2 group">
                            <button
                                type="button"
                                onClick={() => toggleCollapse(section.id)}
                                className="flex items-center gap-2 flex-1 py-1.5 text-left cursor-pointer"
                                aria-expanded={!isCollapsed}
                            >
                                {isCollapsed
                                    ? <ChevronRight size={14} className="text-twilight-text-muted shrink-0" />
                                    : <ChevronDown size={14} className="text-twilight-text-muted shrink-0" />
                                }
                                {isEditing ? (
                                    <input
                                        autoFocus
                                        defaultValue={section.name}
                                        className="bg-transparent text-[12px] font-display font-medium uppercase tracking-wider text-twilight-text outline-none border-b border-accent-primary/30 px-1 -mx-1"
                                        onBlur={(e) => handleRenameSection(section, e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") handleRenameSection(section, (e.target as HTMLInputElement).value);
                                            if (e.key === "Escape") setEditingSection(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span className="text-[13px] font-display font-semibold uppercase tracking-[0.16em] text-twilight-text">
                                        {section.name}
                                    </span>
                                )}
                                <span className="text-[12px] text-twilight-text-soft/90 tabular-nums">
                                    {sectionTasks.length}
                                </span>
                            </button>

                            {/* Section context menu */}
                            <div className={shell.isCompact ? "opacity-100" : "opacity-0 transition-opacity group-hover:opacity-100"}>
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
                                        <DropdownMenu.Item onClick={() => setEditingSection(section.id)}>
                                            <Pencil size={14} className="text-twilight-text-muted mr-2" />
                                            Rename
                                        </DropdownMenu.Item>
                                        <DropdownMenu.Separator />
                                        <DropdownMenu.Item
                                            onClick={() => deleteSection.mutate(section.id)}
                                            className="text-red-400 focus:text-red-400"
                                        >
                                            <Trash2 size={14} className="mr-2" />
                                            Delete section
                                        </DropdownMenu.Item>
                                    </DropdownMenu.Content>
                                </DropdownMenu.Root>
                            </div>

                            <div className="flex-1 h-px bg-gradient-to-r from-twilight-border/20 to-transparent" />
                        </div>

                        {/* Section tasks */}
                        <AnimatePresence initial={false}>
                            {!isCollapsed && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    className="overflow-hidden"
                                >
                                    {sectionTasks.length > 0 ? (
                                        <TaskList
                                            tasks={sectionTasks}
                                            selectedTaskId={selectedTaskId}
                                            onSelectTask={onSelectTask}
                                            rationaleByTaskId={rationaleByTaskId}
                                        />
                                    ) : (
                                        <div className="py-4 px-6 text-[12px] text-twilight-text-muted/40 italic">
                                            No tasks in this section
                                        </div>
                                    )}
                                    <div className={inlineAddClass}>
                                        <AddTaskInput
                                            projectId={projectId ?? undefined}
                                            sectionId={section.id}
                                            tasks={sectionTasks}
                                            compact
                                            placeholder={`Add task to ${section.name}...`}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                );
            })}

            {/* Add section button */}
            <div className="mt-4">
                {isAddingSection ? (
                    <div className="flex items-center gap-2 px-4">
                        <input
                            ref={newSectionInputRef}
                            autoFocus
                            value={newSectionName}
                            onChange={(e) => setNewSectionName(e.target.value)}
                            placeholder="Section name..."
                            className="flex-1 bg-transparent text-[13px] text-twilight-text outline-none border-b border-twilight-border/40 pb-1 placeholder:text-twilight-text-muted/40"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreateSection();
                                if (e.key === "Escape") {
                                    setIsAddingSection(false);
                                    setNewSectionName("");
                                }
                            }}
                            onBlur={() => {
                                if (newSectionName.trim()) handleCreateSection();
                                else {
                                    setIsAddingSection(false);
                                    setNewSectionName("");
                                }
                            }}
                        />
                    </div>
                ) : (
                    <button
                        type="button"
                        data-add-section-trigger
                        onClick={() => setIsAddingSection(true)}
                        className="flex items-center gap-2 text-[12px] text-twilight-text-muted/50 hover:text-twilight-text-muted transition-colors cursor-pointer px-4 py-2"
                    >
                        <Plus size={14} />
                        Add section
                    </button>
                )}
            </div>

            {footer}
        </div>
    );
}
