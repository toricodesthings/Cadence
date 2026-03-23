import { Calendar, Flag, FolderOpen, Hash } from "lucide-react";
import * as Popover from "../primitives/Popover";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import { useProjects } from "../../hooks/projects";
import { useTags } from "../../hooks/tags";
import { resolveQuickAddActions } from "../../lib/utils/quick-add-parser";
import type { TaskPriority } from "../../types/task";
import type { UserSettings } from "../../types/settings";

type QuickAddAction = "date" | "priority" | "project" | "tag";

interface QuickAddActionTrayProps {
    quickAddSettings?: UserSettings["tasks"]["quickAdd"];
    projectLocked?: boolean;
    excludeActions?: QuickAddAction[];
    dueDate: string | null;
    scheduledStart: string | null;
    scheduledEnd?: string | null;
    recurrenceRule: string | null;
    priority: TaskPriority | null;
    projectId: string | null;
    tagIds: string[];
    onScheduleChange: (updates: {
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd?: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }) => void;
    onPriorityChange: (value: TaskPriority | null) => void;
    onProjectChange: (value: string | null) => void;
    onToggleTag: (tagId: string) => void;
}

const PRIORITY_OPTIONS: Array<{ value: TaskPriority | null; label: string }> = [
    { value: null, label: "No priority" },
    { value: 1, label: "P4 · Low" },
    { value: 2, label: "P3 · Medium" },
    { value: 3, label: "P2 · High" },
    { value: 4, label: "P1 · Urgent" },
];

export function QuickAddActionTray({
    quickAddSettings,
    projectLocked = false,
    excludeActions = [],
    dueDate,
    scheduledStart,
    scheduledEnd,
    recurrenceRule,
    priority,
    projectId,
    tagIds,
    onScheduleChange,
    onPriorityChange,
    onProjectChange,
    onToggleTag,
}: QuickAddActionTrayProps) {
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const iconOnly = quickAddSettings?.style === "icon";
    const configuredActions = resolveQuickAddActions(quickAddSettings).filter(
        (action) => !(projectLocked && action === "project") && !excludeActions.includes(action),
    );

    if (!configuredActions.length) {
        return null;
    }

    const selectedProject = projectId ? projects.find((item) => item.id === projectId) : null;
    const selectedTags = tags.filter((item) => tagIds.includes(item.id));

    const renderAction = (action: QuickAddAction) => {
        switch (action) {
            case "date":
                return (
                    <DeadlinePickerPopover
                        dueDate={dueDate}
                        scheduledStart={scheduledStart}
                        scheduledEnd={scheduledEnd}
                        recurrenceRule={recurrenceRule}
                        onChange={onScheduleChange}
                    >
                        <button
                            type="button"
                            className={`relative inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                                dueDate || scheduledStart
                                    ? "border-lantern/20 bg-lantern/10 text-lantern"
                                    : "border-twilight-border/35 bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05]"
                            }`}
                        >
                            <Calendar size={14} aria-hidden="true" />
                            {!iconOnly ? <span>{dueDate || scheduledStart ? "Scheduled" : "Date"}</span> : null}
                        </button>
                    </DeadlinePickerPopover>
                );
            case "priority":
                return (
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button
                                type="button"
                                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                                    priority
                                        ? "border-lantern/20 bg-lantern/10 text-lantern"
                                        : "border-twilight-border/35 bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05]"
                                }`}
                            >
                                <Flag size={14} aria-hidden="true" />
                                {!iconOnly ? <span>{priority ? `P${5 - priority}` : "Priority"}</span> : null}
                            </button>
                        </Popover.Trigger>
                        <Popover.Content className="w-44 p-1">
                            <div className="space-y-1">
                                {PRIORITY_OPTIONS.map((option) => (
                                    <button
                                        key={option.label}
                                        type="button"
                                        onClick={() => onPriorityChange(option.value)}
                                        className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${
                                            priority === option.value
                                                ? "bg-lantern/12 text-lantern"
                                                : "text-twilight-text-soft hover:bg-white/[0.05]"
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </Popover.Content>
                    </Popover.Root>
                );
            case "project":
                return (
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button
                                type="button"
                                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                                    selectedProject
                                        ? "border-lantern/20 bg-lantern/10 text-lantern"
                                        : "border-twilight-border/35 bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05]"
                                }`}
                            >
                                <FolderOpen size={14} aria-hidden="true" />
                                {!iconOnly ? <span>{selectedProject?.name ?? "Project"}</span> : null}
                            </button>
                        </Popover.Trigger>
                        <Popover.Content className="w-56 p-1">
                            <div className="space-y-1">
                                <button
                                    type="button"
                                    onClick={() => onProjectChange(null)}
                                    className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${
                                        !selectedProject
                                            ? "bg-lantern/12 text-lantern"
                                            : "text-twilight-text-soft hover:bg-white/[0.05]"
                                    }`}
                                >
                                    No project
                                </button>
                                {projects.map((project) => (
                                    <button
                                        key={project.id}
                                        type="button"
                                        onClick={() => onProjectChange(project.id)}
                                        className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors ${
                                            selectedProject?.id === project.id
                                                ? "bg-lantern/12 text-lantern"
                                                : "text-twilight-text-soft hover:bg-white/[0.05]"
                                        }`}
                                    >
                                        {project.emoji ? <span aria-hidden="true">{project.emoji}</span> : null}
                                        <span className="truncate">{project.name}</span>
                                    </button>
                                ))}
                            </div>
                        </Popover.Content>
                    </Popover.Root>
                );
            case "tag":
                return (
                    <Popover.Root>
                        <Popover.Trigger asChild>
                            <button
                                type="button"
                                className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                                    selectedTags.length
                                        ? "border-lantern/20 bg-lantern/10 text-lantern"
                                        : "border-twilight-border/35 bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05]"
                                }`}
                            >
                                <Hash size={14} aria-hidden="true" />
                                {!iconOnly ? <span>{selectedTags.length ? `${selectedTags.length} tag${selectedTags.length === 1 ? "" : "s"}` : "Tags"}</span> : null}
                            </button>
                        </Popover.Trigger>
                        <Popover.Content className="w-56 p-1">
                            <div className="max-h-64 space-y-1 overflow-auto">
                                {tags.map((tag) => {
                                    const active = tagIds.includes(tag.id);

                                    return (
                                        <button
                                            key={tag.id}
                                            type="button"
                                            onClick={() => onToggleTag(tag.id)}
                                            className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors ${
                                                active
                                                    ? "bg-lantern/12 text-lantern"
                                                    : "text-twilight-text-soft hover:bg-white/[0.05]"
                                            }`}
                                        >
                                            <span
                                                className="h-2.5 w-2.5 rounded-full"
                                                style={{ backgroundColor: tag.color === "default" ? "var(--color-twilight-text-muted)" : tag.color }}
                                            />
                                            <span className="truncate">{tag.name}</span>
                                        </button>
                                    );
                                })}
                                {!tags.length ? (
                                    <p className="px-3 py-3 text-sm text-twilight-text-muted">Create a tag first to use quick tagging.</p>
                                ) : null}
                            </div>
                        </Popover.Content>
                    </Popover.Root>
                );
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {configuredActions.map((action) => (
                <div key={action}>{renderAction(action)}</div>
            ))}
        </div>
    );
}
