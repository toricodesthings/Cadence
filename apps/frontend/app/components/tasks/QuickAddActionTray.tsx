import { Calendar, FolderOpen, Tag } from "lucide-react";
import * as Popover from "../primitives/Popover";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import type { ScheduleUpdates } from "./QuickScheduleSurface";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { resolveQuickAddActions } from "../../lib/utils/quick-add-parser";
import type { Instant, LocalDate } from "@cadence/domain/time";
import type { TaskPriority } from "@cadence/contracts/task";
import { PRIORITY_ICON, PRIORITY_OPTIONS } from "./task-choice-options";
import type { UserSettings } from "../../types/settings";

type QuickAddAction = "date" | "priority" | "project" | "tag";

interface QuickAddActionTrayProps {
    quickAddSettings?: UserSettings["tasks"]["quickAdd"];
    projectLocked?: boolean;
    excludeActions?: QuickAddAction[];
    dueDate: LocalDate | null;
    endDate?: LocalDate | null;
    scheduledStart: Instant | null;
    scheduledEnd?: Instant | null;
    recurrenceRule: string | null;
    priority: TaskPriority | null;
    projectId: string | null;
    tagIds: string[];
    onScheduleChange: (updates: ScheduleUpdates) => void;
    onPriorityChange: (value: TaskPriority | null) => void;
    onProjectChange: (value: string | null) => void;
    onToggleTag: (tagId: string) => void;
}

const PRIORITY_CHOICES: Array<{ value: TaskPriority | null; label: string }> = [
    { value: null, label: "No priority" },
    ...PRIORITY_OPTIONS.filter((o) => o.value > 0).map((o) => ({ value: o.value, label: `P${5 - o.value} · ${o.label}` })),
];

const TRIGGER = "inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors";
const triggerTone = (active: unknown) => (active
    ? "border-accent-primary/20 bg-accent-primary/10 text-accent-primary"
    : "border-twilight-border/35 bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05]");
const choiceTone = (active: boolean) => (active
    ? "bg-accent-primary/12 text-accent-primary"
    : "text-twilight-text-soft hover:bg-white/[0.05]");

const tagDotColor = (color: string | null | undefined) => (!color || color === "default" ? "var(--color-twilight-text-muted)" : color);

/** One list or tag in a picker popover: its emoji or colour dot, then its name; `active` marks the chosen ones. */
export function PickerChoice({ item, active = false, onClick }: { item: { name: string; emoji?: string | null; color?: string | null }; active?: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm transition-colors ${choiceTone(active)}`}>
            {"color" in item ? (
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tagDotColor(item.color) }} />
            ) : item.emoji ? (
                <span aria-hidden="true">{item.emoji}</span>
            ) : null}
            <span className="truncate">{item.name}</span>
        </button>
    );
}

type DateActionProps = Pick<QuickAddActionTrayProps, "dueDate" | "endDate" | "scheduledStart" | "scheduledEnd" | "recurrenceRule" | "onScheduleChange"> & { iconOnly: boolean };

function DateAction({ dueDate, endDate, scheduledStart, scheduledEnd, recurrenceRule, onScheduleChange, iconOnly }: DateActionProps) {
    const scheduled = dueDate || scheduledStart;
    return (
        <DeadlinePickerPopover
            dueDate={dueDate}
            endDate={endDate}
            scheduledStart={scheduledStart}
            scheduledEnd={scheduledEnd}
            recurrenceRule={recurrenceRule}
            onChange={onScheduleChange}
        >
            <button
                type="button"
                className={`relative ${TRIGGER} ${triggerTone(scheduled)}`}
            >
                <Calendar size={14} aria-hidden="true" />
                {!iconOnly ? <span>{scheduled ? "Scheduled" : "Date"}</span> : null}
            </button>
        </DeadlinePickerPopover>
    );
}

type PriorityActionProps = Pick<QuickAddActionTrayProps, "priority" | "onPriorityChange"> & { iconOnly: boolean };

function PriorityAction({ priority, onPriorityChange, iconOnly }: PriorityActionProps) {
    const PriorityIcon = priority ? PRIORITY_OPTIONS[priority].icon : PRIORITY_ICON;
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className={`${TRIGGER} ${triggerTone(priority)}`}
                >
                    <PriorityIcon size={14} aria-hidden="true" />
                    {!iconOnly ? <span>{priority ? `P${5 - priority}` : "Priority"}</span> : null}
                </button>
            </Popover.Trigger>
            <Popover.Content className="w-44 p-1">
                <div className="space-y-1">
                    {PRIORITY_CHOICES.map((option) => (
                        <button
                            key={option.label}
                            type="button"
                            onClick={() => onPriorityChange(option.value)}
                            className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${choiceTone(priority === option.value)}`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}

type ProjectActionProps = Pick<QuickAddActionTrayProps, "projectId" | "onProjectChange"> & { iconOnly: boolean };

function ProjectAction({ projectId, onProjectChange, iconOnly }: ProjectActionProps) {
    const { data: projects = [] } = useProjects();
    const selectedProject = projectId ? projects.find((item) => item.id === projectId) : null;
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className={`${TRIGGER} ${triggerTone(selectedProject)}`}
                >
                    <FolderOpen size={14} aria-hidden="true" />
                    {!iconOnly ? <span>{selectedProject?.name ?? "List"}</span> : null}
                </button>
            </Popover.Trigger>
            <Popover.Content className="w-56 p-1">
                <div className="space-y-1">
                    <button
                        type="button"
                        onClick={() => onProjectChange(null)}
                        className={`flex min-h-10 w-full items-center rounded-xl px-3 text-left text-sm transition-colors ${choiceTone(!selectedProject)}`}
                    >
                        No list
                    </button>
                    {projects.map((project) => (
                        <PickerChoice key={project.id} item={project} active={selectedProject?.id === project.id} onClick={() => onProjectChange(project.id)} />
                    ))}
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}

type TagActionProps = Pick<QuickAddActionTrayProps, "tagIds" | "onToggleTag"> & { iconOnly: boolean };

const tagCountLabel = (count: number) => (count ? `${count} tag${count === 1 ? "" : "s"}` : "Tags");
function TagAction({ tagIds, onToggleTag, iconOnly }: TagActionProps) {
    const { data: tags = [] } = useTags();
    const selectedCount = tags.filter((item) => tagIds.includes(item.id)).length;
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className={`${TRIGGER} ${triggerTone(selectedCount)}`}
                >
                    <Tag size={14} aria-hidden="true" />
                    {!iconOnly ? <span>{tagCountLabel(selectedCount)}</span> : null}
                </button>
            </Popover.Trigger>
            <Popover.Content className="w-56 p-1">
                <div className="max-h-64 space-y-1 overflow-auto">
                    {tags.map((tag) => (
                        <PickerChoice key={tag.id} item={tag} active={tagIds.includes(tag.id)} onClick={() => onToggleTag(tag.id)} />
                    ))}
                    {!tags.length ? (
                        <p className="px-3 py-3 text-sm text-twilight-text-muted">Create a tag first to use quick tagging.</p>
                    ) : null}
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}

export function QuickAddActionTray({
    quickAddSettings,
    projectLocked = false,
    excludeActions = [],
    ...fields
}: QuickAddActionTrayProps) {
    const iconOnly = quickAddSettings?.style === "icon";
    const configuredActions = resolveQuickAddActions(quickAddSettings).filter(
        (action) => !(projectLocked && action === "project") && !excludeActions.includes(action),
    );

    if (!configuredActions.length) {
        return null;
    }

    const actions: Record<QuickAddAction, React.ReactNode> = {
        date: <DateAction {...fields} iconOnly={iconOnly} />,
        priority: <PriorityAction {...fields} iconOnly={iconOnly} />,
        project: <ProjectAction {...fields} iconOnly={iconOnly} />,
        tag: <TagAction {...fields} iconOnly={iconOnly} />,
    };

    return (
        <div className="flex flex-wrap items-center gap-2">
            {configuredActions.map((action) => (
                <div key={action}>{actions[action]}</div>
            ))}
        </div>
    );
}
