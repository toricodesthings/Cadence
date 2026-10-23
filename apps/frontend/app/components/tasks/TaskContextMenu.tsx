import { useContext, useState, type ReactNode } from "react";
import { EllipsisVertical, Pin, Copy, Trash2, Calendar, Bell, Sun, CalendarDays, ArrowRight, CalendarClock, Clock, X, ListChecks, Pencil, ChevronLeft, ChevronRight, Sunrise, type LucideIcon } from "lucide-react";
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
    MenuComponents: GenericMenu;
    onCloseMenu?: () => void;
    /** When true, renders a simplified shallow menu for Holding context (Phase 5) */
    holdingContext?: boolean;
}

/** Reusable inner items for either DropdownMenu or ContextMenu */

/** A menu row that opens a second view instead of closing the menu. */
function submenuItem(Menu: GenericMenu, icon: ReactNode, label: string, hint: ReactNode, open: VoidFunction) {
    return (
        <Menu.Item onSelect={(event) => { event.preventDefault(); open(); }}>
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
/** A plain menu row: icon, label, and an optional key hint at the far end. */
function menuRow(Menu: GenericMenu, Icon: LucideIcon, label: string, select: () => void, { hint, iconClass, danger }: { hint?: string; iconClass?: string; danger?: boolean } = {}) {
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

/** The task's planning offer, echoed as the menu's last item so it is always in the same place, never shifting the rest. */
function suggestedRow(Menu: GenericMenu, offer: ReturnType<typeof useShownOffer>) {
    return offer ? (
        <>
            <Menu.Separator />
            <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-twilight-text-muted">Suggested</div>
            {menuRow(Menu, ListChecks, OFFER_LABEL[offer.kind], offer.accept)}
        </>
    ) : null;
}

export function TaskMenuItems({ task, onAddSubtask, onRename, MenuComponents: Menu, onCloseMenu, holdingContext }: TaskMenuItemsProps) {
    // Place lists tasks for one chosen day: Find a time looks there, not at the task's own day.
    const findDay = useContext(FindTimeDayContext);
    const archiveTask = useArchiveTask();
    const updateTask = useUpdateTask();
    const duplicateTask = useDuplicateTask();
    const findTime = useFindTime();
    const shownOffer = useShownOffer(task.id);
    const addTaskTag = useAddTaskTag();
    const removeTaskTag = useRemoveTaskTag();
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

    const setReminder = (reminderAt: string | null) => updateTask.mutate({ id: task.id, reminderAt, reminderSilenced: false });

    /** Opens the reminder picker; a new reminder starts on the deadline when there is one. */
    const handleOpenReminder = () => {
        trackMenuAction(task.reminderAt ? "edit_reminder" : "set_reminder");
        if (!task.reminderAt && deadlineInstant) setReminder(deadlineInstant);
        setMenuView("reminder");
    };

    const handleQuickSchedule = (daysToAdd: number, startOfWeekend = false, nextWeek = false) => {
        trackMenuAction(nextWeek ? "reschedule_next_week" : startOfWeekend ? "reschedule_weekend" : daysToAdd === 0 ? "reschedule_today" : daysToAdd === 1 ? "reschedule_tomorrow" : `reschedule_${daysToAdd}_days`);
        const now = today();
        const weekday = weekdayOf(now);
        const day = nextWeek
            ? addDays(now, (1 + 7 - weekday) % 7 || 7) // Next Monday
            : startOfWeekend
                ? addDays(now, (6 - weekday + 7) % 7 || 7) // Next Saturday
                : addDays(now, daysToAdd);

        // The task keeps its shape: an all-day task moves its days, a timed one keeps its time on the new day.
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
                <SubviewHeader title={SUBVIEW_TITLE[menuView]} onBack={() => setMenuView("main")} onClose={() => onCloseMenu?.()} />

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
                    <ReschedulePresets onPick={handleQuickSchedule} onCustom={() => setMenuView("reschedule-custom")} onClear={clearSchedule} />
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

    const rescheduleItem = submenuItem(Menu, <Calendar size={16} />, "Reschedule", <span>r</span>, () => setMenuView("reschedule-presets"));
    const findTimeItem = canFindTime(task) ? menuRow(Menu, Clock, findDay ? `Find a time on ${formatInZone(atLocal(findDay, "12:00", getUserZone()), getUserZone(), { weekday: "short" })}` : "Find a time", () => { trackMenuAction("find_time"); void findTime.run(task, findDay ? { day: findDay } : {}); }) : null;
    const suggestedItem = suggestedRow(Menu, shownOffer);
    const reminderItem = submenuItem(
        Menu,
        <Bell size={16} />,
        task.reminderAt ? "Reminder" : "Set Reminder",
        task.reminderAt && <span>{formatShortDateTime(task.reminderAt)}</span>,
        handleOpenReminder,
    );

    return (
        <>
            {holdingContext ? (
                <>
                    {rescheduleItem}

                    {findTimeItem}

                    {menuRow(Menu, Pin, task.isPinned ? "Unpin task" : "Pin to top", handleTogglePin, { iconClass: task.isPinned ? "fill-accent-primary text-accent-primary" : "" })}

                    {menuRow(Menu, Pencil, "Rename", () => onRename?.())}

                    <MoveToSubmenu
                        MenuComponents={Menu}
                        currentProjectId={task.projectId}
                        onSelect={(projectId) => updateTask.mutate({ id: task.id, projectId })}
                    />

                    <Menu.Separator />

                    {menuRow(Menu, Trash2, "Move to Trash", () => archiveTask.mutate(task.id), { danger: true })}

                    {suggestedItem}
                </>
            ) : (
                <>
            {/* ── Scheduling & Time ── */}
            {rescheduleItem}

            {findTimeItem}

            {reminderItem}

            <Menu.Separator />

            <OrganizeItems
                Menu={Menu}
                task={task}
                onUpdate={(patch) => updateTask.mutate({ id: task.id, ...patch })}
                onAddTag={(tagId) => addTaskTag.mutate({ taskId: task.id, tagId })}
                onRemoveTag={(tagId) => removeTaskTag.mutate({ taskId: task.id, tagId })}
            />

            <Menu.Separator />

            {/* ── Status & Actions ── */}
            {menuRow(Menu, Pin, task.isPinned ? "Unpin task" : "Pin to top", handleTogglePin, { hint: "p", iconClass: task.isPinned ? "fill-accent-primary text-accent-primary" : "" })}

            {menuRow(Menu, Pencil, "Rename", () => onRename?.(), { hint: "e" })}

            {menuRow(Menu, Copy, "Duplicate", () => duplicateTask.mutate(task.id))}

            {onAddSubtask && menuRow(Menu, ListChecks, "Add subtask", onAddSubtask)}

            <Menu.Separator />

            {menuRow(Menu, Trash2, "Move to Trash", () => archiveTask.mutate(task.id), { hint: "Del", danger: true })}

            {suggestedItem}
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
            <p className="text-sm font-semibold text-twilight-text">
                {title}
            </p>
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

const PRESET_BUTTON = "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-twilight-border/35 bg-white/[0.02] px-3 py-3 text-xs font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05] hover:text-twilight-text";

type QuickSchedule = (daysToAdd: number, startOfWeekend?: boolean, nextWeek?: boolean) => void;

const PRESETS: { label: string; icon: LucideIcon; iconClass: string; days: number; weekend?: boolean; nextWeek?: boolean }[] = [
    { label: "Today", icon: Sun, iconClass: "text-accent-primary", days: 0 },
    { label: "Tomorrow", icon: Sunrise, iconClass: "text-twilight-text-muted", days: 1 },
    { label: "Next week", icon: ArrowRight, iconClass: "text-twilight-text-muted", days: 0, weekend: false, nextWeek: true },
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
                    <button key={label} type="button" onClick={() => onPick(days, weekend, nextWeek)} className={PRESET_BUTTON}>
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
    onUpdate: (patch: UpdateTaskInput) => void;
    onAddTag: (tagId: string) => void;
    onRemoveTag: (tagId: string) => void;
};

/** Priority, effort, tags, list and section. */
function OrganizeItems({ Menu, task, onUpdate, onAddTag, onRemoveTag }: OrganizeItemsProps) {
    return (
        <>
            {/* ── Priority ── */}
            {/* The child will be wrapped in Radix primitives, make sure PriorityPicker supports Menu abstraction 
                Wait, PriorityPicker renders DropdownMenu internally! 
                We must adapt PriorityPicker too, or just render something simpler for ContextMenu.
                For now we'll allow PriorityPicker to be its own Dropdown. Note: nested dropdowns over context menu might be tricky,
                let's pass MenuComponents to PriorityPicker too if needed, or assume it's okay. 
                Wait! Radix doesn't allow a DropdownMenu trigger inside a ContextMenu item directly if it's not a Submenu. 
                Instead we will pass Menu={Menu} to PriorityPicker, MoveToSubmenu, TagPickerSubmenu. 
            */}
            <PriorityPicker
                currentPriority={task.priority}
                onSelect={(p) => onUpdate({ priority: p })}
            />

            {/* ── Effort ── */}
            <EffortPicker
                currentEffort={task.effort}
                onSelect={(e) => onUpdate({ effort: e, ...(e && { effortOrigin: "manual" as const }) })}
            />

            <Menu.Separator />

            {/* ── Organization ── */}
            <TagPickerSubmenu
                MenuComponents={Menu}
                activeTagIds={task.tagIds ?? []}
                onAdd={onAddTag}
                onRemove={onRemoveTag}
            />

            <MoveToSubmenu
                MenuComponents={Menu}
                currentProjectId={task.projectId}
                onSelect={(projectId) => onUpdate({ projectId })}
            />

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
    return (
        <>
            {menuRow(DropdownMenu, Pin, task.isPinned ? "Unpin task" : "Pin to top", () => updateTask.mutate({ id: task.id, isPinned: !task.isPinned }), { iconClass: task.isPinned ? "fill-accent-primary text-accent-primary" : "" })}
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
    holdingContext?: boolean;
}

export function TaskContextMenu({ task, onAddSubtask, onRename, holdingContext }: TaskContextMenuProps) {
    const [open, setOpen] = useState(false);
    const shell = useShellMode();

    return (
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
            <DropdownMenu.Trigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    // Touch keeps the 44px target; a mouse gets a lighter 36px one.
                    className="pointer-fine:h-9 pointer-fine:w-9"
                    aria-label={`Open actions for ${task.title}`}
                >
                    <EllipsisVertical size={16} />
                </Button>
            </DropdownMenu.Trigger>

            {shell.isCompact ? (
                /* Compact: quick actions only — everything editable lives in task detail. */
                <DropdownMenu.Content className="w-56" side="bottom" align="end" sideOffset={4}>
                    <TaskQuickActions task={task} />
                </DropdownMenu.Content>
            ) : (
            <DropdownMenu.Content className="w-[22rem]" side="right" align="start" sideOffset={8}>
                <TaskMenuItems
                    task={task}
                    onAddSubtask={onAddSubtask}
                    onRename={onRename}
                    MenuComponents={DropdownMenu}
                    onCloseMenu={() => setOpen(false)}
                    holdingContext={holdingContext}
                />
            </DropdownMenu.Content>
            )}
        </DropdownMenu.Root>
    );
}
