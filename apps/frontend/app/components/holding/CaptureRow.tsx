import { COLLECTION_ROW_SURFACE, COLLECTION_ROW_HOVER, COLLECTION_ROW_TITLE } from "../tasks/task-row-styles";
import { useRef, useState, useEffect, useId } from "react";
import {
    CalendarClock,
    CalendarDays,
    CalendarPlus,
    CheckSquare,
    ListChecks,
    Inbox,
    MoreVertical,
    Moon,
    StickyNote,
    Sun,
    Trash2,
} from "lucide-react";
import type { InboxItem } from "@cadence/contracts/inbox";
import type { Task } from "@cadence/contracts/task";
import type { Subtask } from "@cadence/contracts/subtask";
import { useThoughtParse } from "../../hooks/inbox/use-thought-parse";
import { useProcessInboxToTask, todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";
import { useCaptureActions } from "../../hooks/inbox/use-capture-actions";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { useSettings } from "../../hooks/core/use-settings";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";
import { MonthCalendar } from "../shared/DatePicker";
import { placementLabel, relativeTime } from "../../lib/utils/date-format";
import { isPersistedId } from "../../lib/api/optimistic-id";
import { ThoughtMark } from "../tasks/ThoughtMark";
import { TagSignal } from "../tasks/TagSignal";
import { useTags } from "../../hooks/tags/use-tags";
import { useAddTaskTag } from "../../hooks/tags/use-task-tags";
import { useUpdateInboxItem } from "../../hooks/inbox/use-update-inbox-item";
import { TAG_DRAG_TYPE } from "../sidebar/TagBubble";
import { TaskCheckbox } from "../tasks/TaskCheckbox";
import { InlineSubtaskPanel, SUBTASK_RAIL, SubtaskChip, useInlineSubtasks } from "../tasks/InlineSubtasks";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives/Tooltip";
import * as Menu from "../primitives/DropdownMenu";
import { PlaceDraggable, usePlaceTask } from "./PlaceSheet";
import { DAY_PILL, DAY_PILL_PLAIN, DAY_PILL_SUGGESTED } from "./CaptureDayChips";
import { toast } from "sonner";

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
}: {
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
}) {
    const object = (item ?? task)!;
    const parse = useThoughtParse(item?.rawText ?? "", (item?.analysis?.dismissedEntityIds ?? []) as string[]);
    const process = useProcessInboxToTask();
    const status = useCaptureActions();
    const update = useUpdateTask();
    const addTaskTag = useAddTaskTag();
    const updateItem = useUpdateInboxItem();
    const [tagOver, setTagOver] = useState(false);
    const placeTask = usePlaceTask();
    const shell = useShellMode();
    const coarse = useIsCoarsePointer();
    const stacked = stackedProp || shell.isPhone;
    const { data: settings } = useSettings();
    const quiet = settings?.tasks.intelligence?.lowStimulationMode;
    const { data: allTags = [] } = useTags();
    const [menuOpen, setMenuOpen] = useState(false);
    const subtaskUi = useInlineSubtasks(task?.id ?? "");
    const subtaskPanelId = useId();
    const [pickerMonth, setPickerMonth] = useState(() => new Date());
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );
    const longPressed = useRef(false);
    const overrides = item?.analysis?.userOverrides as
        | { title?: string; projectId?: string | null; tagIds?: string[] }
        | undefined;
    const title = task?.title ?? overrides?.title ?? item!.rawText;
    const disabled = !isPersistedId(object.id) || process.isPending || status.isPending;
    const place = (date?: string, complete = false) => {
        if (disabled) return;
        if (task) {
            if (date) void placeTask(task, date).catch(() => {});
            return;
        }
        process.mutate({
            inboxItemId: object.id,
            rawText: item!.rawText,
            title: overrides?.title ?? (date || parse.tagIds.length ? parse.cleanedTitle || title : title),
            ...(date
                ? { scheduledDate: date }
                : {
                      isAllDay: true,
                      dueDate: null,
                      scheduledStart: null,
                      scheduledEnd: null,
                  }),
            projectId: overrides?.projectId !== undefined ? overrides.projectId : parse.projectId,
            tagIds: overrides?.tagIds ?? parse.tagIds,
            complete,
            nlp: {
                rawInput: item!.rawText,
                sourceSurface: "inbox",
                dateStyle: settings?.dateTime.dateStyle ?? "mdy",
                dismissedEntityIds: (item?.analysis?.dismissedEntityIds ?? []) as string[],
                userOverrides: overrides ?? {},
            },
        });
    };
    const discard = () => {
        if (item) {
            void status.setStatus(item, "discarded").catch(() => {});
            return;
        }
        update.mutate(
            { id: object.id, state: "ARCHIVED" },
            {
                onSuccess: () =>
                    toast("Discarded", {
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
    const detected = item && item.captureStatus !== "kept" ? (parse.scheduledStart ?? parse.dueDate) : null;
    const pill = (day: string, suggested: boolean, className = "") => (
        <Tip label={`Place on ${placementLabel(day)}`}>
            <Button
                variant="ghost"
                size="none"
                type="button"
                disabled={disabled}
                onClick={() => place(day)}
                aria-label={`Place on ${placementLabel(day)}`}
                className={`${DAY_PILL} gap-1.5 ${suggested ? DAY_PILL_SUGGESTED : DAY_PILL_PLAIN} ${className}`}
            >
                <CalendarPlus size={12} aria-hidden />
                {placementLabel(day)}
            </Button>
        </Tip>
    );
    return (
        <PlaceDraggable id={`capture:${object.id}`} title={title} onPlace={(date) => place(date)}>
            <article
                data-capture-row={object.id}
                data-focus-kind={item ? "inbox" : "task"}
                data-focus-id={object.id}
                tabIndex={tabIndex}
                aria-label={title}
                data-selected={selected}
                onFocus={() => {
                    onFocusRow?.();
                }}
                onPointerDown={(e) => {
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
                }}
                onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(TAG_DRAG_TYPE)) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "copy";
                    setTagOver(true);
                }}
                onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setTagOver(false);
                }}
                onDrop={(e) => {
                    const tagId = e.dataTransfer.getData(TAG_DRAG_TYPE);
                    if (!tagId) return;
                    e.preventDefault();
                    setTagOver(false);
                    addTag(tagId);
                }}
                onPointerUp={cancelPress}
                onPointerCancel={cancelPress}
                onPointerMove={cancelPress}
                onClickCapture={(e) => {
                    if (e.shiftKey || longPressed.current) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!longPressed.current) onToggleSelection?.();
                        longPressed.current = false;
                    }
                }}
                onKeyDown={(e) => {
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
                }}
                className={`${COLLECTION_ROW_SURFACE} min-w-0 px-4 py-3.5 sm:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${selected ? "bg-accent-primary/10 ring-accent-primary/15" : COLLECTION_ROW_HOVER} ${tagOver ? "ring-1 ring-accent-primary/40" : ""}`}
            >
                {/* Side controls centre on the 44px title line, like task cards, so a tag line hangs below. */}
                <div className="flex min-h-9 items-start gap-2">
                    <div className="flex h-11 shrink-0 items-center">
                        {task ? (
                            <TaskCheckbox task={task} compact />
                        ) : (
                            <Tip label="Tick off thought">
                                <Button
                                    variant="ghost"
                                    size="none"
                                    disabled={disabled}
                                    onClick={() => place(undefined, true)}
                                    aria-label="Tick off thought"
                                    className="h-8 w-8 shrink-0 rounded-full hover:bg-transparent active:scale-100"
                                >
                                    <span
                                        aria-hidden
                                        className="h-6 w-6 rounded-full border-[1.5px] border-twilight-text-muted/70 transition-colors duration-200 group-hover:border-accent-primary/50"
                                    />
                                </Button>
                            </Tip>
                        )}
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
                            className={`block min-h-11 w-full min-w-0 rounded-lg px-1 text-left font-sans font-normal text-twilight-text hover:text-twilight-text active:scale-100 ${COLLECTION_ROW_TITLE}`}
                        >
                            <span className="line-clamp-2 break-words">{title}</span>
                        </Button>
                        {(rowTags.length > 0 || (stacked && detected)) && (
                            <div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
                                {stacked && detected && pill(detected, true)}
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
                        {!stacked &&
                            (detected
                                ? pill(detected, true)
                                : !coarse &&
                                  item?.captureStatus !== "kept" &&
                                  pill(
                                      lightest,
                                      false,
                                      "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
                                  ))}
                    </div>
                    {!quiet && !stacked && (
                        <time
                            className="min-w-9 shrink-0 whitespace-nowrap text-right text-xs leading-[2.75rem] tabular-nums text-twilight-text-muted"
                            dateTime={object.createdAt}
                        >
                            {relativeTime(object.createdAt)}
                        </time>
                    )}
                    <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
                        <Tip label="More actions">
                            <Menu.Trigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Actions for ${title}`}
                                    className="shrink-0 opacity-40 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:opacity-100"
                                >
                                    <MoreVertical size={16} />
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
                                        <Sun size={16} className="text-accent-primary" aria-hidden />
                                        Today
                                    </Menu.Item>
                                    <Menu.Item
                                        className="gap-2.5"
                                        disabled={disabled}
                                        onSelect={() => place(tomorrowISO())}
                                    >
                                        <Moon size={16} aria-hidden />
                                        Tomorrow
                                    </Menu.Item>
                                    <Menu.Sub>
                                        <Menu.SubTrigger className="flex items-center gap-2.5" disabled={disabled}>
                                            <CalendarDays size={16} aria-hidden />
                                            Pick day…
                                        </Menu.SubTrigger>
                                        <Menu.SubContent className="w-72 p-0">
                                            <MonthCalendar
                                                viewDate={pickerMonth}
                                                onViewDateChange={setPickerMonth}
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
                                        <CalendarClock size={16} aria-hidden />
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
                                            <Inbox size={16} aria-hidden />
                                        ) : (
                                            <StickyNote size={16} aria-hidden />
                                        )}
                                        {item.captureStatus === "kept" ? "Back to New" : "Keep as a note"}
                                    </Menu.Item>
                                </>
                            )}
                            {task && (
                                <Menu.Item className="gap-2.5" disabled={disabled} onSelect={subtaskUi.startAdding}>
                                    <ListChecks size={16} aria-hidden />
                                    Add subtask
                                </Menu.Item>
                            )}
                            <Menu.Item className="gap-2.5" onSelect={() => onToggleSelection?.()}>
                                <CheckSquare size={16} aria-hidden />
                                Select
                            </Menu.Item>
                            <Menu.Item className="gap-2.5" disabled={disabled} variant="danger" onSelect={discard}>
                                <Trash2 size={16} aria-hidden />
                                Discard
                            </Menu.Item>
                        </Menu.Content>
                    </Menu.Root>
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
