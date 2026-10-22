import { COLLECTION_ROW_SURFACE, COLLECTION_ROW_HOVER, COLLECTION_ROW_SELECTED, COLLECTION_ROW_TITLE } from "../tasks/task-row-styles";
import { useRef, useState, useEffect, useId } from "react";
import {
    CalendarPlus, CheckSquare, FolderOpen, ListChecks, Inbox, EllipsisVertical, Moon, StickyNote, Sun, Trash2, Calendar, Sunrise,
} from "lucide-react";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { Task } from "@cadence/contracts/task";
import type { Subtask } from "@cadence/contracts/subtask";
import { useThoughtParse } from "../../hooks/inbox/use-thought-parse";
import { useProcessInboxToTask, todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";
import { resolvedNlp } from "../../lib/utils/task/resolved-nlp";
import { useCaptureActions } from "../../hooks/inbox/use-capture-actions";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { useSettings } from "../../hooks/core/use-settings";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { MonthCalendar } from "../shared/DatePicker";
import type { Instant, LocalDate } from "@cadence/domain/time";
import { placementLabel, relativeTime, toDay } from "../../lib/utils/date-format";
import { today } from "../../lib/utils/user-zone";
import { ThoughtMark } from "../tasks/ThoughtMark";
import { TagSignal } from "../tasks/TagSignal";
import { useTags } from "../../hooks/tags/use-tags";
import { useProjects } from "../../hooks/projects/use-projects";
import { useSections } from "../../hooks/sections/use-sections";
import { overridesOf, placementFor } from "../../lib/utils/task/suggested-placement";
import { useAddTaskTag } from "../../hooks/tags/use-task-tags";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { TAG_DRAG_TYPE } from "../sidebar/TagBubble";
import { TaskCheckbox } from "../tasks/TaskCheckbox";
import { InlineSubtaskPanel, SUBTASK_RAIL, SubtaskChip, useInlineSubtasks } from "../tasks/InlineSubtasks";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives/Tooltip";
import * as Menu from "../primitives/DropdownMenu";
import { PlaceDraggable, usePlaceTask } from "./PlaceSheet";
import { DAY_PILL, DAY_PILL_PLAIN, DAY_PILL_SUGGESTED, placeFields } from "./CaptureDayChips";
import { toast } from "sonner";
import { PendingMark } from "../shared/PendingMark";

/** Explicit nulls: the server must not infer a day from the text. */
const NO_DAY = { dueDate: null, scheduledStart: null, scheduledEnd: null };

/** What the row shows: a capture (with the person's own edits) or the task it became. */
function rowSubject(item: InboxItem | undefined, task: Task | undefined) {
    const overrides = item ? overridesOf(item) : undefined;
    return {
        object: (item ?? task)!,
        overrides,
        title: task?.title ?? overrides?.title ?? item!.rawText,
        dismissedIds: (item?.analysis?.dismissedEntityIds ?? []) as string[],
        rawText: item?.rawText ?? "",
        taskId: task?.id ?? "",
    };
}

/** Where Done puts it, as "List · Section". The chip skips a cue word's list: the words already say it. */
function usePlacementChip(item: InboxItem | undefined, cueProjectId: string | null | undefined) {
    const placement = item ? placementFor(item, { cue: cueProjectId }) : null;
    const chip = item?.captureStatus !== "kept" && placement?.projectId !== cueProjectId ? placement : null;
    const { data: lists = [] } = useProjects();
    const { data: listSections = [] } = useSections(chip?.projectId);
    const listName = chip ? lists.find((list) => list.id === chip.projectId)?.name : undefined;
    const sectionName = chip?.sectionId ? listSections.find((section) => section.id === chip.sectionId)?.name : undefined;
    return { placement, placementLabelText: listLabel(listName, sectionName) };
}

function listLabel(listName: string | undefined, sectionName: string | undefined) {
    if (!listName) return null;
    return sectionName ? `${listName} · ${sectionName}` : listName;
}

function rowClass(selected: boolean | undefined, tagOver: boolean) {
    const tone = selected ? `${COLLECTION_ROW_SELECTED} [--row-wash:color-mix(in_srgb,var(--accent-primary)_10%,transparent)] ring-accent-primary/15` : COLLECTION_ROW_HOVER;
    return `${COLLECTION_ROW_SURFACE} min-w-0 px-4 py-3.5 sm:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${tone} ${tagOver ? "ring-1 ring-accent-primary/40" : ""}`;
}

type DayPillProps = { day: string; suggested?: boolean; className?: string; disabled: boolean; onPlace: (day: string) => void };

/** Place on a day, named the way the row says it. */
function DayPill({ day, suggested = false, className = "", disabled, onPlace }: DayPillProps) {
    return (
        <Tip label={`Place on ${placementLabel(day)}`}>
            <Button
                variant="ghost"
                size="none"
                type="button"
                aria-label={`Place on ${placementLabel(day)}`}
                disabled={disabled}
                onClick={() => onPlace(day)}
                className={`${DAY_PILL} gap-1.5 ${suggested ? DAY_PILL_SUGGESTED : DAY_PILL_PLAIN} ${className}`}
            >
                <CalendarPlus aria-hidden size={12} />
                {placementLabel(day)}
            </Button>
        </Tip>
    );
}

type SideDayPillProps = { detected: string | null | undefined; lightest: string; offerLightest: boolean; disabled: boolean; onPlace: (day: string) => void };

/** The day the words name; otherwise, on hover, the lightest day. */
function SideDayPill({ detected, lightest, offerLightest, disabled, onPlace }: SideDayPillProps) {
    if (detected) return <DayPill day={detected} suggested disabled={disabled} onPlace={onPlace} />;
    if (!offerLightest) return null;
    return (
        <DayPill
            day={lightest}
            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
            disabled={disabled}
            onPlace={onPlace}
        />
    );
}

type TickOffProps = { disabled: boolean; onTick: () => void };

function TickOff({ disabled, onTick }: TickOffProps) {
    return (
        <Tip label="Tick off thought">
            <Button
                variant="ghost"
                size="none"
                aria-label="Tick off thought"
                disabled={disabled}
                onClick={onTick}
                className="h-8 w-8 shrink-0 rounded-full hover:bg-transparent press-none"
            >
                <span
                    aria-hidden
                    className="h-6 w-6 rounded-full border-[1.5px] border-twilight-text-muted/70 transition-colors duration-200 group-hover:border-accent-primary/50"
                />
            </Button>
        </Tip>
    );
}

type RowMenuProps = {
    item?: InboxItem;
    task?: Task;
    title: string;
    disabled: boolean;
    place: (when?: LocalDate | Instant, complete?: boolean) => void;
    discard: () => void;
    /** The row's own capture actions, so a pending change disables the whole row. */
    status: ReturnType<typeof useCaptureActions>;
    subtaskUi: ReturnType<typeof useInlineSubtasks>;
    onToggleSelection?: () => void;
};

/** The row's ⋮: place it (today, tomorrow, a day, no day), keep it as a note, add a subtask, select, discard. */
function RowMenu({ item, task, title, disabled, place, discard, status, subtaskUi, onToggleSelection }: RowMenuProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const [pickerMonth, setPickerMonth] = useState<LocalDate>(() => today());
    return (
        <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <Tip label="More actions">
                <Menu.Trigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${title}`}
                        className="shrink-0 opacity-40 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
                    >
                        <EllipsisVertical size={16} />
                    </Button>
                </Menu.Trigger>
            </Tip>
            <Menu.Content
                align="end"
                // "Add subtask" focuses its input; handing focus back to ⋮ would blur and close it.
                onCloseAutoFocus={(e) => subtaskUi.adding && e.preventDefault()}
            >
                {item?.captureStatus !== "kept" && (
                    <>
                        <Menu.Item
                            className="gap-2.5"
                            disabled={disabled}
                            onSelect={() => place(todayISO())}
                        >
                            <Sun aria-hidden size={16} className="text-accent-primary" />
                            Today
                        </Menu.Item>
                        <Menu.Item
                            className="gap-2.5"
                            disabled={disabled}
                            onSelect={() => place(tomorrowISO())}
                        >
                            <Sunrise aria-hidden size={16} />
                            Tomorrow
                        </Menu.Item>
                        <Menu.Sub>
                            <Menu.SubTrigger className="flex items-center gap-2.5" disabled={disabled}>
                                <Calendar aria-hidden size={16} />
                                Pick day…
                            </Menu.SubTrigger>
                            <Menu.SubContent className="w-72 p-0">
                                <MonthCalendar
                                    viewDay={pickerMonth}
                                    onViewDayChange={setPickerMonth}
                                    selectedDate=""
                                    onSelectDate={(day) => {
                                        place(day);
                                        setMenuOpen(false);
                                    }}
                                />
                            </Menu.SubContent>
                        </Menu.Sub>
                        <Menu.Separator />
                    </>
                )}
                {item && (
                    <>
                        <Menu.Item className="gap-2.5" disabled={disabled} onSelect={() => place()}>
                            <Moon aria-hidden size={16} />
                            No day yet
                        </Menu.Item>
                        <Menu.Item
                            className="gap-2.5"
                            disabled={disabled}
                            onSelect={() =>
                                void status
                                    .setStatus(item, item.captureStatus === "kept" ? "clarifying" : "kept")
                                    .catch(() => {})
                            }
                        >
                            {item.captureStatus === "kept" ? (
                                <Inbox aria-hidden size={16} />
                            ) : (
                                <StickyNote aria-hidden size={16} />
                            )}
                            {item.captureStatus === "kept" ? "Back to New" : "Keep as a note"}
                        </Menu.Item>
                    </>
                )}
                {task && (
                    <Menu.Item className="gap-2.5" disabled={disabled} onSelect={subtaskUi.startAdding}>
                        <ListChecks aria-hidden size={16} />
                        Add subtask
                    </Menu.Item>
                )}
                <Menu.Item className="gap-2.5" onSelect={() => onToggleSelection?.()}>
                    <CheckSquare aria-hidden size={16} />
                    Select
                </Menu.Item>
                <Menu.Item className="gap-2.5" disabled={disabled} variant="danger" onSelect={discard}>
                    <Trash2 aria-hidden size={16} />
                    Discard
                </Menu.Item>
            </Menu.Content>
        </Menu.Root>
    );
}

type CaptureRowProps = {
    item?: InboxItem;
    task?: Task;
    subtasks?: Subtask[];
    lightest: string;
    onOpen: () => void;
    selected?: boolean;
    onToggleSelection?: () => void;
    tabIndex?: number;
    onFocusRow?: () => void;
    /** Narrow layouts (phone, board columns): the day pill drops under the title and the age hides. */
    stacked?: boolean;
};

export function CaptureRow({
    item,
    task,
    subtasks = [],
    lightest,
    onOpen,
    selected,
    onToggleSelection,
    tabIndex = 0,
    onFocusRow,
    stacked: stackedProp = false,
}: CaptureRowProps) {
    const { object, overrides, title, dismissedIds, rawText, taskId } = rowSubject(item, task);
    const parse = useThoughtParse(rawText, dismissedIds);
    const process = useProcessInboxToTask();
    const status = useCaptureActions();
    const update = useUpdateTask();
    const addTaskTag = useAddTaskTag();
    const updateItem = useUpdateInboxItem();
    const [tagOver, setTagOver] = useState(false);
    const placeTask = usePlaceTask();
    const shell = useShellMode();
    const stacked = stackedProp || shell.isPhone;
    const { data: settings } = useSettings();
    const quiet = settings?.tasks.intelligence?.lowStimulationMode;
    const ageDays = Math.floor((Date.now() - Date.parse(object.createdAt)) / 86_400_000);
    const { data: allTags = [] } = useTags();
    const { placement, placementLabelText } = usePlacementChip(item, parse.projectId);
    const subtaskUi = useInlineSubtasks(taskId);
    const subtaskPanelId = useId();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    const longPressed = useRef(false);
    const disabled = process.isPending || status.isPending;
    const place = (when?: LocalDate | Instant, complete = false) => {
        if (disabled) return;
        if (task) {
            if (when) void placeTask(task, toDay(when)).catch(() => {});
            return;
        }
        process.mutate(capturePayload(when, complete));
    };
    /** Its own title, else the words without what they set (once they placed or tagged it). */
    const captureTitle = (when: LocalDate | Instant | undefined) =>
        overrides?.title ?? (when || parse.tagIds.length ? parse.cleanedTitle || title : title);
    /** The list and section the capture goes to; none unless chosen. */
    const placedIn = () => ({ projectId: placement?.projectId ?? null, sectionId: placement?.sectionId ?? null });
    const dateStyle = settings?.dateTime.dateStyle ?? "mdy";
    /** The capture as a task: its words read once, placed on `when` or explicitly on no day. */
    const capturePayload = (when: LocalDate | Instant | undefined, complete: boolean) => ({
        inboxItemId: object.id,
        rawText: item!.rawText,
        title: captureTitle(when),
        ...(when ? placeFields(when) : NO_DAY),
        ...placedIn(),
        tagIds: overrides?.tagIds ?? parse.tagIds,
        priority: parse.priority ?? 0,
        durationEstimate: parse.durationMinutes,
        waitingOn: parse.waitingOn,
        reminderAt: parse.fields.reminderAt,
        notBefore: parse.fields.notBefore,
        complete,
        nlp: resolvedNlp(
            item!.rawText,
            "inbox",
            dateStyle,
            dismissedIds,
            overrides ?? {},
        ),
    });
    const discard = () => {
        if (item) {
            void status.setStatus(item, "discarded").catch(() => {});
            return;
        }
        update.mutate(
            { id: object.id, state: "ARCHIVED" },
            {
                onSuccess: () =>
                    toast.message("Discarded", {
                        action: {
                            label: "Undo",
                            onClick: () => update.mutate({ id: object.id, state: "ACTIVE" }),
                        },
                    }),
            },
        );
    };
    const cancelPress = () => {
        if (timer.current) clearTimeout(timer.current);
    };
    const rowTagIds = task?.tagIds ?? overrides?.tagIds ?? parse.tagIds;
    const rowTags = allTags.filter((t) => rowTagIds.includes(t.id));
    const addTag = (tagId: string) => {
        if (disabled || rowTagIds.includes(tagId)) return;
        if (task) addTaskTag.mutate({ taskId: task.id, tagId });
        else
            updateItem.mutate({
                id: object.id,
                analysis: { ...item!.analysis, userOverrides: { ...overrides, tagIds: [...rowTagIds, tagId] } },
            });
    };
    const startPress = (e: React.PointerEvent) => {
        if (
            e.pointerType !== "touch" ||
            (e.target as HTMLElement).closest("button:not([data-capture-title])")
        )
            return;
        longPressed.current = false;
        timer.current = setTimeout(() => {
            longPressed.current = true;
            onToggleSelection?.();
        }, 500);
    };
    const dragOver = (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(TAG_DRAG_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setTagOver(true);
    };
    const dragLeave = (e: React.DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setTagOver(false);
    };
    const dropTag = (e: React.DragEvent) => {
        const tagId = e.dataTransfer.getData(TAG_DRAG_TYPE);
        if (!tagId) return;
        e.preventDefault();
        setTagOver(false);
        addTag(tagId);
    };
    /** 1/2/3 place today, tomorrow or with no day; x ticks off; arrows and j/k move between rows. */
    const keyDown = (e: React.KeyboardEvent<HTMLElement>) => {
        if ((e.target as HTMLElement).closest("[role=menu]")) return;
        if (e.target !== e.currentTarget && !["1", "2", "3", "x"].includes(e.key)) return;
        const actions: Record<string, () => void> = {
            "1": () => place(todayISO()),
            "2": () => place(tomorrowISO()),
            "3": () => place(),
            x: () =>
                item
                    ? place(undefined, true)
                    : (e.currentTarget.querySelector("button") as HTMLButtonElement)?.click(),
            Enter: onOpen,
            Backspace: discard,
            Delete: discard,
            " ": () => onToggleSelection?.(),
        };
        if (["ArrowDown", "ArrowUp", "j", "k"].includes(e.key)) {
            e.preventDefault();
            const rows = [...document.querySelectorAll<HTMLElement>("[data-capture-row]")].filter(
                (row) => row.getClientRects().length,
            );
            rows[rows.indexOf(e.currentTarget) + (["ArrowDown", "j"].includes(e.key) ? 1 : -1)]?.focus();
        } else if (actions[e.key] && !disabled) {
            e.preventDefault();
            e.stopPropagation();
            actions[e.key]();
        }
    };
    const detected = item && item.captureStatus !== "kept" ? (parse.scheduledStart ?? parse.dueDate) : null;
    return (
        <PlaceDraggable id={`capture:${object.id}`} title={title} onPlace={(date) => place(date)}>
            <article
                data-focus-kind={item ? "inbox" : "task"}
                data-focus-id={object.id}
                aria-label={title}
                data-selected={selected}
                data-capture-row={object.id}
                tabIndex={tabIndex}
                onFocus={() => {
                    onFocusRow?.();
                }}
                onPointerDown={startPress}
                onDragOver={dragOver}
                onDragLeave={dragLeave}
                onDrop={dropTag}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onPointerMove={cancelPress}
                onKeyDown={keyDown}
                onClickCapture={(e) => {
                    if (e.shiftKey || longPressed.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!longPressed.current) onToggleSelection?.();
                        longPressed.current = false;
                    }
                }}
                className={rowClass(selected, tagOver)}
            >
                {/* Side controls centre on the 44px title line, like task cards, so a tag line hangs below. */}
                <div className="flex min-h-9 items-start gap-2">
                    <div className="flex h-11 shrink-0 items-center">
                        {task ? <TaskCheckbox task={task} compact /> : <TickOff disabled={disabled} onTick={() => place(undefined, true)} />}
                    </div>
                    {task?.origin === "thought" && (
                        <div className="flex h-11 shrink-0 items-center">
                            <ThoughtMark />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <Button
                            variant="text"
                            size="none"
                            data-capture-title
                            disabled={disabled}
                            onClick={onOpen}
                            className={`block min-h-11 w-full min-w-0 rounded-lg px-1 text-left font-sans font-normal text-twilight-text hover:text-twilight-text press-none ${COLLECTION_ROW_TITLE}`}
                        >
                            <span className="line-clamp-3 break-words">{title}<PendingMark id={object.id} /></span>
                        </Button>
                        {(rowTags.length > 0 || placementLabelText || (stacked && detected)) && (
                            <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
                                {stacked && detected && <DayPill day={detected} suggested disabled={disabled} onPlace={place} />}
                                {placementLabelText && (
                                    <span className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-twilight-border px-2 py-0.5 text-xs text-twilight-text-soft">
                                        <FolderOpen aria-hidden size={12} />
                                        {placementLabelText}
                                    </span>
                                )}
                                <TagSignal tags={rowTags} />
                            </div>
                        )}
                        {task && subtasks.length > 0 && (
                            <div className="px-1">
                                <SubtaskChip
                                    subtasks={subtasks}
                                    open={subtaskUi.open}
                                    onToggle={subtaskUi.toggle}
                                    controls={subtaskPanelId}
                                />
                            </div>
                        )}
                    </div>
                    <div className="flex h-11 shrink-0 items-center">
                        {stacked ? null : <SideDayPill detected={detected} lightest={lightest} offerLightest={!shell.isTouch && item?.captureStatus !== "kept"} disabled={disabled} onPlace={place} />}
                    </div>
                    {/* Age only once it means something; fresh rows stay quiet. */}
                    {!quiet && !stacked && ageDays >= 3 && (
                        <time
                            className="min-w-9 shrink-0 whitespace-nowrap text-right text-xs leading-[2.75rem] tabular-nums text-twilight-text-muted"
                            dateTime={object.createdAt}
                            title={`Captured ${ageDays} days ago`}
                        >
                            {relativeTime(object.createdAt)}
                        </time>
                    )}
                    <RowMenu
                        item={item}
                        task={task}
                        title={title}
                        disabled={disabled}
                        place={place}
                        discard={discard}
                        status={status}
                        subtaskUi={subtaskUi}
                        onToggleSelection={onToggleSelection}
                    />
                </div>
                {task && ((subtaskUi.open && subtasks.length > 0) || subtaskUi.adding) && (
                    // Under the checkbox (w-8 at the px-4/sm:px-5 edge, centred on the 44px title line), down past the subtasks.
                    <span aria-hidden="true" className={`absolute bottom-3.5 left-8 top-[3.25rem] sm:left-9 ${SUBTASK_RAIL}`} />
                )}
                {task && (
                    // Below the whole row so it spans past the day pill and time; indented to the title (checkbox
                    // w-8 + gap-2, plus the 14px ThoughtMark + gap-2). Stops row drag and row shortcuts in the list.
                    <div
                        className={task.origin === "thought" ? "pl-[3.875rem]" : "pl-10"}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                    >
                        <InlineSubtaskPanel
                            id={subtaskPanelId}
                            taskId={task.id}
                            subtasks={subtasks}
                            open={subtaskUi.open}
                            adding={subtaskUi.adding}
                            onAddingChange={subtaskUi.setAdding}
                        />
                    </div>
                )}
            </article>
        </PlaceDraggable>
    );
}
