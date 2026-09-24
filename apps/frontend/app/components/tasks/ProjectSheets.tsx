import { useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { UtilitySheet } from "../shared/UtilitySheet";
import { Composer } from "../shared/Composer";
import { useTaskComposer, chipClass, tasksIn, UNSECTIONED_ID } from "./TaskComposer";
import { Tip } from "../primitives/Tooltip";
import { Button } from "../primitives/Button";
import * as AlertDialog from "../primitives/AlertDialog";
import { useSections, useCreateSection, useUpdateSection, useDeleteSection } from "../../hooks/sections/use-sections";
import type { TaskSection } from "@cadence/contracts/section";
import type { Task } from "@cadence/contracts/task";

export { UNSECTIONED_ID };

/** Chip for the end of the compact section chooser — opens the sections sheet. */
export function AddSectionChip({ onClick }: { onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={`${chipClass(false)} border-dashed`}>
            <Plus size={15} aria-hidden="true" />
            Section
        </button>
    );
}

/** Compact direct add: the orb opens the task composer straight into this project. */
export function ProjectTaskSheet({ open, onClose, projectId, projectName, tasks, sectionId, onSectionChange }: {
    open: boolean;
    onClose: () => void;
    projectId: string;
    projectName: string;
    tasks: Task[];
    sectionId: string;
    onSectionChange: (id: string) => void;
}) {
    const { reset, ...draft } = useTaskComposer({
        open,
        tasks,
        project: { id: projectId, name: projectName, sectionId, onSectionChange },
        onSaved: onClose,
    });
    return <Composer open={open} onClose={() => { reset(); onClose(); }} {...draft} />;
}

function SectionRow({ section, count, onRename, onDelete }: {
    section: TaskSection;
    count: number;
    onRename: (name: string) => void;
    onDelete: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(section.name);
    const save = () => {
        if (name.trim() && name.trim() !== section.name) onRename(name.trim());
        setEditing(false);
    };

    return (
        <li className="flex min-h-14 items-center gap-2 rounded-2xl border border-twilight-border/40 bg-white/[0.03] pl-4 pr-1">
            {editing ? (
                <form className="flex min-w-0 flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); save(); }}>
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onKeyDown={(e) => e.key === "Escape" && (setName(section.name), setEditing(false))}
                        aria-label={`Rename ${section.name}`}
                        className="min-w-0 flex-1 border-b border-accent-primary/40 bg-transparent py-1 text-base text-twilight-text outline-none"
                    />
                    <Tip label="Save name"><button type="submit" className="mobile-icon-button text-accent-primary" aria-label="Save name">
                        <Check size={18} aria-hidden="true" />
                    </button></Tip>
                </form>
            ) : (
                <>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-twilight-text">{section.name}</span>
                    <span className="text-[12px] tabular-nums text-twilight-text-soft/90">{count}</span>
                    <Tip label="Rename section"><button type="button" onClick={() => setEditing(true)} className="mobile-icon-button" aria-label={`Rename ${section.name}`}>
                        <Pencil size={16} aria-hidden="true" />
                    </button></Tip>
                    <Tip label="Delete section"><button type="button" onClick={onDelete} className="mobile-icon-button text-red-400" aria-label={`Delete ${section.name}`}>
                        <Trash2 size={16} aria-hidden="true" />
                    </button></Tip>
                </>
            )}
        </li>
    );
}

/** Compact section management: add, rename and delete a project's sections. */
export function ProjectSectionsSheet({ open, onClose, projectId, tasks }: {
    open: boolean;
    onClose: () => void;
    projectId: string;
    tasks: Task[];
}) {
    const { data: sections = [] } = useSections(projectId);
    const createSection = useCreateSection(projectId);
    const updateSection = useUpdateSection(projectId);
    const deleteSection = useDeleteSection(projectId);
    const [newName, setNewName] = useState("");
    const [pendingDelete, setPendingDelete] = useState<TaskSection | null>(null);
    const pendingCount = pendingDelete ? tasksIn(tasks, pendingDelete.id).length : 0;

    const add = () => {
        const name = newName.trim();
        if (!name) return;
        const orderIndex = sections.length > 0 ? Math.max(...sections.map((s) => s.orderIndex)) + 1 : 1;
        createSection.mutate({ name, orderIndex });
        setNewName("");
    };

    return (
        <>
            <UtilitySheet
                title="Sections"
                subtitle="Group this list's tasks"
                open={open}
                onClose={onClose}
                footer={
                    <form className="flex items-center gap-2 border-t border-twilight-border px-4 py-3" onSubmit={(e) => { e.preventDefault(); add(); }}>
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="New section name"
                            aria-label="New section name"
                            className="min-h-12 min-w-0 flex-1 rounded-2xl border border-twilight-border bg-twilight-surface/40 px-4 text-base text-twilight-text placeholder:text-twilight-text-muted/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-primary"
                        />
                        <button type="submit" disabled={!newName.trim()} className="min-h-12 shrink-0 cursor-pointer rounded-2xl bg-accent-primary px-5 font-medium text-[var(--primary-foreground)] disabled:opacity-50 active:opacity-80">
                            Add
                        </button>
                    </form>
                }
            >
                {sections.length > 0 ? (
                    <ul className="flex flex-col gap-2 pt-3">
                        {sections.map((section) => (
                            <SectionRow
                                key={section.id}
                                section={section}
                                count={tasksIn(tasks, section.id).length}
                                onRename={(name) => updateSection.mutate({ id: section.id, name })}
                                onDelete={() => setPendingDelete(section)}
                            />
                        ))}
                    </ul>
                ) : (
                    <p className="pt-4 text-sm text-twilight-text-soft">No sections yet. Tasks without one stay in Unsectioned.</p>
                )}
            </UtilitySheet>

            <AlertDialog.Root open={Boolean(pendingDelete)} onOpenChange={(value) => !value && setPendingDelete(null)}>
                <AlertDialog.Content>
                    <AlertDialog.Header>
                        <AlertDialog.Title>Delete "{pendingDelete?.name}"?</AlertDialog.Title>
                        <AlertDialog.Description>
                            {pendingCount > 0
                                ? `Its ${pendingCount} ${pendingCount === 1 ? "task moves" : "tasks move"} to Unsectioned.`
                                : "This section is empty."}
                        </AlertDialog.Description>
                    </AlertDialog.Header>
                    <AlertDialog.Footer>
                        <AlertDialog.Cancel asChild>
                            <Button variant="ghost" size="md">Cancel</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <Button variant="danger" size="md" onClick={() => pendingDelete && deleteSection.mutate(pendingDelete.id)}>
                                Delete section
                            </Button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </>
    );
}
