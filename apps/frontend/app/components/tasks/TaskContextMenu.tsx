import { useContext, useState, type ReactNode } from "react";
import {
    EllipsisVertical,
    Pin,
    Copy,
    Trash2,
    Calendar,
    Bell,
    Sun,
    CalendarDays,
    ArrowRight,
    CalendarClock,
    Clock,
    X,
    ListChecks,
    Pencil,
    ChevronLeft,
    ChevronRight,
    Hand,
    Sunrise,
    SlidersHorizontal,
    Undo2,
    type LucideIcon,
} from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import type { GenericMenu } from "../primitives/menu-styles";
import { Button } from "../primitives/Button";
import { useArchiveTask } from "../../hooks/tasks/use-archive-task";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { canFindTime, FindTimeDayContext, useFindTime } from "../../hooks/tasks/use-find-time";
import { OFFER_LABEL, useShownOffer } from "../../hooks/ai/use-planning-offers";
import { useDuplicateTask } from "../../hooks/tasks/use-duplicate-task";
import { useAddTaskTag, useRemoveTaskTag } from "../../hooks/tags/use-task-tags";
import { PriorityPicker } from "./PriorityPicker";
import { EffortPicker } from "./EffortPicker";
import { QuickScheduleSurface } from "./QuickScheduleSurface";
import { MoveToSubmenu } from "./MoveToSubmenu";
import { MoveToSectionSubmenu } from "./MoveToSectionSubmenu";
import { TagPickerSubmenu } from "./TagPickerSubmenu";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useTaskAccess } from "../../hooks/sharing/use-list-access";
import { useEditableProjects } from "../../hooks/projects/use-own-projects";
import { guardMoveToShared } from "../sharing/MoveToSharedConfirm";
import { usePersonInList } from "../../hooks/sharing/use-list-people";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { CreatedBy } from "../sharing/CreatedBy";
import type { Task, UpdateTaskInput } from "@cadence/contracts/task";
import { trackUsageEvent } from "../../lib/api/track-event";
import { addDays, atLocal, formatInZone, weekdayOf } from "@cadence/domain/time";
import { rescheduleToDay } from "@cadence/domain/task-temporal";
import { getUserZone, today } from "../../lib/utils/user-zone";
import { useSettings } from "../../hooks/core/use-settings";
import { deadlineReminderAt } from "../../lib/notifications/reminder-engine";
import { formatShortDateTime } from "../../lib/utils/date-format";

export interface TaskMenuItemsProps {
    task: Task;
    onAddSubtask?: () => void;
    onRename?: () => void;
    onOpen?: () => void;
    MenuComponents: GenericMenu;
    onCloseMenu?: () => void;
    holdingContext?: boolean;
}

function submenuItem(Menu: GenericMenu, icon: ReactNode, label: string, hint: ReactNode, open: VoidFunction) {
    return (
        <Menu.Item
            onSelect={(event) => {
                event.preventDefault();
                open();
            }}
        >
            <div className="flex w-full items-center gap-2">
                {icon}
                <span>{label}</span>
                <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-twilight-text-muted/90">
                    {hint}
                    <ChevronRight aria-hidden="true" size={13} />
                </span>
            </div>
        </Menu.Item>
    );
}
function menuRow(
    Menu: GenericMenu,
    Icon: LucideIcon,
    label: string,
    select: () => void,
    { hint, iconClass, danger }: { hint?: string; iconClass?: string; danger?: boolean } = {},
) {
    return (
        <Menu.Item onSelect={select} variant={danger ? "danger" : "default"}>
            <div className="flex items-center gap-2">
                <Icon size={16} className={iconClass} />
                <span>{label}</span>
                {hint ? <kbd className="ml-auto font-mono text-[10px] opacity-40">{hint}</kbd> : null}
            </div>
        </Menu.Item>
    );
}

function TakeTaskMenuItems({ Menu, task }: { Menu: GenericMenu; task: Task }) {
    const access = useTaskAccess(task);
    const { session } = useAuthState();
    const myId = session?.user?.id;
    const updateTask = useUpdateTask();
    const { person: taker, former: takerFormer } = usePersonInList(task.projectId, task.takenBy);
    if (!access.isShared || !access.canEdit || !myId) return null;
    if (task.takenBy === myId) {
        return menuRow(Menu, Undo2, "Not doing it", () => updateTask.mutate({ id: task.id, takenBy: null }));
    }
    return (
        <>
            {menuRow(Menu, Hand, "I'll do it", () => updateTask.mutate({ id: task.id, takenBy: myId }))}
            {task.takenBy &&
                access.isOwner &&
                menuRow(Menu, Undo2, `Clear ${takerFormer ? "former member" : (taker?.name ?? "someone")}`, () =>
                    updateTask.mutate({ id: task.id, takenBy: null }),
                )}
        </>
    );
}

function suggestedRow(Menu: GenericMenu, offer: ReturnType<typeof useShownOffer>) {
    return offer ? (
        <>
            <Menu.Separator />
            <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-twilight-text-muted">
                Suggested
            </div>
            {menuRow(Menu, ListChecks, OFFER_LABEL[offer.kind], offer.accept)}
        </>
    ) : null;
}

export function TaskMenuItems({
    task,
    onAddSubtask,
    onRename,
    onOpen,
    MenuComponents: Menu,
    onCloseMenu,
    holdingContext,
}: TaskMenuItemsProps) {
    const access = useTaskAccess(task);
    const findDay = useContext(FindTimeDayContext);
    const archiveTask = useArchiveTask();
    const updateTask = useUpdateTask();
    const duplicateTask = useDuplicateTask();
    const findTime = useFindTime();
    const shownOffer = useShownOffer(task.id);
    const addTaskTag = useAddTaskTag();
    const removeTaskTag = useRemoveTaskTag();
    const { data: editableProjects = [] } = useEditableProjects();
    const [menuView, setMenuView] = useState<"main" | Subview>("main");
    const { data: settings } = useSettings();
    const deadlineInstant = deadlineReminderAt(task, settings?.notifications?.morningTime);

    const trackMenuAction = (outcome: string) => {
        trackUsageEvent("task.context_menu_action", { object_type: "task", outcome });
    };

    const handleTogglePin = () => {
        trackMenuAction(task.isPinned ? "unpin" : "pin");
        updateTask.mutate({ id: task.id, isPinned: !task.isPinned });
    };

    const setReminder = (reminderAt: string | null) =>
        updateTask.mutate({ id: task.id, reminderAt, reminderSilenced: false });

    const handleOpenReminder = () => {
        trackMenuAction(task.reminderAt ? "edit_reminder" : "set_reminder");
        if (!task.reminderAt && deadlineInstant) setReminder(deadlineInstant);
        setMenuView("reminder");
    };

    const handleQuickSchedule = (daysToAdd: number, startOfWeekend = false, nextWeek = false) => {
        trackMenuAction(
            nextWeek
                ? "reschedule_next_week"
                : startOfWeekend
                  ? "reschedule_weekend"
                  : daysToAdd === 0
                    ? "reschedule_today"
                    : daysToAdd === 1
                      ? "reschedule_tomorrow"
                      : `reschedule_${daysToAdd}_days`,
        );
        const now = today();
        const weekday = weekdayOf(now);
        const day = nextWeek
            ? addDays(now, (1 + 7 - weekday) % 7 || 7)
            : startOfWeekend
              ? addDays(now, (6 - weekday + 7) % 7 || 7)
              : addDays(now, daysToAdd);

        const moved = rescheduleToDay(task, day, getUserZone());
        updateTask.mutate({
            id: task.id,
            dueDate: moved.dueDate,
            endDate: moved.endDate,
            scheduledStart: moved.scheduledStart,
            scheduledEnd: moved.scheduledEnd,
        });
        onCloseMenu?.();
    };

    const clearSchedule = () => {
        trackMenuAction("clear_schedule");
        updateTask.mutate({ id: task.id, scheduledStart: null, scheduledEnd: null, dueDate: null, endDate: null });
        onCloseMenu?.();
    };

    if (menuView !== "main") {
        return (
            <div className="-m-1 overflow-hidden">
                <SubviewHeader
                    title={SUBVIEW_TITLE[menuView]}
                    onBack={() => setMenuView("main")}
                    onClose={() => onCloseMenu?.()}
                />

                {menuView === "reminder" ? (
                    <QuickScheduleSurface
                        variant="moment"
                        dueDate={null}
                        scheduledStart={task.reminderAt ?? deadlineInstant}
                        recurrenceRule={null}
                        onChange={(updates) => setReminder(updates.scheduledStart)}
                        onRequestClose={() => onCloseMenu?.()}
                    />
                ) : menuView === "reschedule-presets" ? (
                    <ReschedulePresets
                        onPick={handleQuickSchedule}
                        onCustom={() => setMenuView("reschedule-custom")}
                        onClear={clearSchedule}
                    />
                ) : (
                    <QuickScheduleSurface
                        dueDate={task.dueDate}
                        endDate={task.endDate}
                        scheduledStart={task.scheduledStart}
                        scheduledEnd={task.scheduledEnd}
                        recurrenceRule={task.recurrenceRule}
                        isOpen={menuView === "reschedule-custom"}
                        onChange={(updates) => updateTask.mutate({ id: task.id, ...updates })}
                        onRequestClose={() => setMenuView("reschedule-presets")}
                    />
                )}
            </div>
        );
    }

    const rescheduleItem = submenuItem(Menu, <Calendar size={16} />, "Reschedule", <span>r</span>, () =>
        setMenuView("reschedule-presets"),
    );
    const findTimeItem = canFindTime(task)
        ? menuRow(
              Menu,
              Clock,
              findDay
                  ? `Find a time on ${formatInZone(atLocal(findDay, "12:00", getUserZone()), getUserZone(), { weekday: "short" })}`
                  : "Find a time",
              () => {
                  trackMenuAction("find_time");
                  void findTime.run(task, findDay ? { day: findDay } : {});
              },
          )
        : null;
    const suggestedItem = suggestedRow(Menu, shownOffer);
    const reminderItem = submenuItem(
        Menu,
        <Bell size={16} />,
        task.reminderAt ? "Reminder" : "Set Reminder",
        task.reminderAt && <span>{formatShortDateTime(task.reminderAt)}</span>,
        handleOpenReminder,
    );

    const takeItem = <TakeTaskMenuItems Menu={Menu} task={task} />;

    const madeBy = access.isShared ? (
        <>
            <Menu.Separator />
            <div className="px-3 py-2">
                <CreatedBy task={task} />
            </div>
        </>
    ) : null;

    if (!access.canEdit)
        return (
            <>
                {onOpen && menuRow(Menu, SlidersHorizontal, "Open", onOpen)}
                {reminderItem}
                <TagPickerSubmenu
                    MenuComponents={Menu}
                    activeTagIds={task.tagIds ?? []}
                    onAdd={(tagId) => addTaskTag.mutate({ taskId: task.id, tagId })}
                    onRemove={(tagId) => removeTaskTag.mutate({ taskId: task.id, tagId })}
                />
                {madeBy}
            </>
        );

    return (
        <>
            {holdingContext ? (
                <>
                    {rescheduleItem}

                    {findTimeItem}

                    {menuRow(Menu, Pin, task.isPinned ? "Unpin task" : "Pin to top", handleTogglePin, {
                        iconClass: task.isPinned ? "fill-accent-primary text-accent-primary" : "",
                    })}

                    {menuRow(Menu, Pencil, "Rename", () => onRename?.())}

                    <MoveToSubmenu
                        MenuComponents={Menu}
                        currentProjectId={task.projectId}
                        currentSectionId={task.sectionId ?? null}
                        onSelect={(projectId, sectionId) => {
                            const dest = editableProjects.find((p) => p.id === projectId);
                            guardMoveToShared(dest, access.isShared, () =>
                                updateTask.mutate({ id: task.id, projectId, sectionId }),
                            );
                        }}
                    />

                    <Menu.Separator />

                    {menuRow(Menu, Trash2, "Move to Trash", () => archiveTask.mutate(task.id), { danger: true })}

                    {suggestedItem}
                </>
            ) : (
                <>
                    {rescheduleItem}

                    {findTimeItem}

                    {reminderItem}

                    {takeItem}

                    <Menu.Separator />

                    <OrganizeItems
                        Menu={Menu}
                        task={task}
                        isOwner={access.isOwner}
                        onUpdate={(patch) => updateTask.mutate({ id: task.id, ...patch })}
                        onAddTag={(tagId) => addTaskTag.mutate({ taskId: task.id, tagId })}
                        onRemoveTag={(tagId) => removeTaskTag.mutate({ taskId: task.id, tagId })}
                    />

                    <Menu.Separator />

                    {menuRow(Menu, Pin, task.isPinned ? "Unpin task" : "Pin to top", handleTogglePin, {
                        hint: "p",
                        iconClass: task.isPinned ? "fill-accent-primary text-accent-primary" : "",
                    })}

                    {menuRow(Menu, Pencil, "Rename", () => onRename?.(), { hint: "e" })}

                    {menuRow(Menu, Copy, "Duplicate", () => duplicateTask.mutate(task.id))}

                    {onAddSubtask && menuRow(Menu, ListChecks, "Add subtask", onAddSubtask)}

                    <Menu.Separator />

                    {menuRow(Menu, Trash2, "Move to Trash", () => archiveTask.mutate(task.id), {
                        hint: "Del",
                        danger: true,
                    })}

                    {suggestedItem}

                    {madeBy}
                </>
            )}
        </>
    );
}

type Subview = "reschedule-presets" | "reschedule-custom" | "reminder";

const SUBVIEW_TITLE: Record<Subview, string> = {
    reminder: "Remind me",
    "reschedule-custom": "Custom schedule",
    "reschedule-presets": "Reschedule task",
};

type SubviewHeaderProps = { title: string; onBack: () => void; onClose: () => void };

function SubviewHeader({ title, onBack, onClose }: SubviewHeaderProps) {
    return (
        <div className="flex items-center justify-between border-b border-twilight-border/40 px-4 py-3">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-twilight-text-muted transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
            >
                <ChevronLeft aria-hidden="true" size={13} />
                Back
            </button>
            <p className="text-sm font-semibold text-twilight-text">{title}</p>
            <button
                type="button"
                onClick={onClose}
                className="inline-flex cursor-pointer items-center justify-center rounded-lg p-1.5 text-twilight-text-muted transition-colors hover:bg-white/[0.05] hover:text-twilight-text"
                aria-label="Close task menu"
            >
                <X aria-hidden="true" size={14} />
            </button>
        </div>
    );
}

const PRESET_BUTTON =
    "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-twilight-border/35 bg-white/[0.02] px-3 py-3 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text";

type QuickSchedule = (daysToAdd: number, startOfWeekend?: boolean, nextWeek?: boolean) => void;

const PRESETS: {
    label: string;
    icon: LucideIcon;
    iconClass: string;
    days: number;
    weekend?: boolean;
    nextWeek?: boolean;
}[] = [
    { label: "Today", icon: Sun, iconClass: "text-accent-primary", days: 0 },
    { label: "Tomorrow", icon: Sunrise, iconClass: "text-twilight-text-muted", days: 1 },
    {
        label: "Next week",
        icon: ArrowRight,
        iconClass: "text-twilight-text-muted",
        days: 0,
        weekend: false,
        nextWeek: true,
    },
    { label: "Weekend", icon: CalendarDays, iconClass: "text-twilight-text-muted", days: 0, weekend: true },
    { label: "3 days", icon: CalendarClock, iconClass: "text-twilight-text-muted", days: 3 },
];

type ReschedulePresetsProps = { onPick: QuickSchedule; onCustom: () => void; onClear: () => void };

function ReschedulePresets({ onPick, onCustom, onClear }: ReschedulePresetsProps) {
    return (
        <div className="p-3">
            <div className="px-1 pb-3">
                <p className="text-sm font-semibold text-twilight-text">Choose a date fast</p>
                <p className="mt-1 text-xs leading-relaxed text-twilight-text-muted">
                    Pick a quick preset or open the full scheduler without leaving the task menu.
                </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {PRESETS.map(({ label, icon: Icon, iconClass, days, weekend, nextWeek }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => onPick(days, weekend, nextWeek)}
                        className={PRESET_BUTTON}
                    >
                        <Icon aria-hidden="true" size={16} className={iconClass} />
                        <span>{label}</span>
                    </button>
                ))}
                <button
                    type="button"
                    onClick={onCustom}
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-accent-primary/18 bg-accent-primary/10 px-3 py-3 text-xs font-medium text-accent-primary transition-colors hover:bg-accent-primary/14"
                >
                    <Calendar aria-hidden="true" size={16} />
                    <span>Custom</span>
                </button>
            </div>

            <div className="mt-3 border-t border-twilight-border/35 pt-3">
                <button
                    type="button"
                    onClick={onClear}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-red-400/80 transition-colors hover:bg-red-500/10 hover:text-red-300"
                >
                    <X aria-hidden="true" size={14} />
                    <span>Remove date</span>
                </button>
            </div>
        </div>
    );
}

type OrganizeItemsProps = {
    Menu: GenericMenu;
    task: Task;
    isOwner: boolean;
    onUpdate: (patch: UpdateTaskInput) => void;
    onAddTag: (tagId: string) => void;
    onRemoveTag: (tagId: string) => void;
};

function OrganizeItems({ Menu, task, isOwner, onUpdate, onAddTag, onRemoveTag }: OrganizeItemsProps) {
    const { data: editableProjects = [] } = useEditableProjects();
    const { isShared } = useTaskAccess(task);
    return (
        <>
            <PriorityPicker currentPriority={task.priority} onSelect={(p) => onUpdate({ priority: p })} />

            <EffortPicker
                currentEffort={task.effort}
                onSelect={(e) => onUpdate({ effort: e, ...(e && { effortOrigin: "manual" as const }) })}
            />

            <Menu.Separator />

            <TagPickerSubmenu
                MenuComponents={Menu}
                activeTagIds={task.tagIds ?? []}
                onAdd={onAddTag}
                onRemove={onRemoveTag}
            />

            {isOwner && (
                <MoveToSubmenu
                    MenuComponents={Menu}
                    currentProjectId={task.projectId}
                    currentSectionId={task.sectionId ?? null}
                    onSelect={(projectId, sectionId) => {
                        const dest = editableProjects.find((p) => p.id === projectId);
                        guardMoveToShared(dest, isShared, () => onUpdate({ projectId, sectionId }));
                    }}
                />
            )}

            <MoveToSectionSubmenu
                MenuComponents={Menu}
                currentProjectId={task.projectId}
                currentSectionId={task.sectionId ?? null}
                onSelect={(sectionId) => onUpdate({ sectionId })}
            />
        </>
    );
}

function TaskQuickActions({ task }: { task: Task }) {
    const shownOffer = useShownOffer(task.id);
    const updateTask = useUpdateTask();
    const duplicateTask = useDuplicateTask();
    const archiveTask = useArchiveTask();
    const access = useTaskAccess(task);
    if (!access.canEdit)
        return (
            <div className="px-3 py-2">
                <CreatedBy task={task} />
            </div>
        );
    return (
        <>
            <TakeTaskMenuItems Menu={DropdownMenu} task={task} />
            {menuRow(
                DropdownMenu,
                Pin,
                task.isPinned ? "Unpin task" : "Pin to top",
                () => updateTask.mutate({ id: task.id, isPinned: !task.isPinned }),
                { iconClass: task.isPinned ? "fill-accent-primary text-accent-primary" : "" },
            )}
            {menuRow(DropdownMenu, Copy, "Duplicate", () => duplicateTask.mutate(task.id))}
            <DropdownMenu.Separator />
            {menuRow(DropdownMenu, Trash2, "Move to Trash", () => archiveTask.mutate(task.id), { danger: true })}
            {suggestedRow(DropdownMenu, shownOffer)}
        </>
    );
}

export interface TaskContextMenuProps {
    task: Task;
    onAddSubtask?: () => void;
    onRename?: () => void;
    onOpen?: () => void;
    holdingContext?: boolean;
}

export function TaskContextMenu({ task, onAddSubtask, onRename, onOpen, holdingContext }: TaskContextMenuProps) {
    const [open, setOpen] = useState(false);
    const shell = useShellMode();

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
            <DropdownMenu.Trigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="pointer-fine:h-9 pointer-fine:w-9"
                    aria-label={`Open actions for ${task.title}`}
                >
                    <EllipsisVertical size={16} />
                </Button>
            </DropdownMenu.Trigger>

            {shell.isCompact ? (
                <DropdownMenu.Content className="w-56" side="bottom" align="end" sideOffset={4}>
                    <TaskQuickActions task={task} />
                </DropdownMenu.Content>
            ) : (
                <DropdownMenu.Content className="w-[22rem]" side="right" align="start" sideOffset={8}>
                    <TaskMenuItems
                        task={task}
                        onAddSubtask={onAddSubtask}
                        onRename={onRename}
                        onOpen={onOpen}
                        MenuComponents={DropdownMenu}
                        onCloseMenu={() => setOpen(false)}
                        holdingContext={holdingContext}
                    />
                </DropdownMenu.Content>
            )}
        </DropdownMenu.Root>
    );
}
