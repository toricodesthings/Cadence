import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { Inbox, CalendarClock, ChevronRight, StickyNote, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { BucketedCollectionView, BucketedSectionHeader } from "../shared/BucketedCollectionView";
import { useId, useMemo, useState } from "react";
import { applyFocusView } from "@cadence/nlp/focus-views/apply";
import type { InboxItem } from "@cadence/contracts/inbox";
import { useCaptureFeed } from "../../hooks/inbox/use-capture-feed";
import { useFocusViewStore } from "../../stores/focus-view-store";
import { useProcessInboxToTask } from "../../hooks/inbox/use-process-inbox-to-task";
import { useCaptureActions } from "../../hooks/inbox/use-capture-actions";
import { useUpdateTask } from "../../hooks/tasks/use-update-task";
import { useSubtasksByTaskIds } from "../../hooks/tasks/use-subtasks";
import { useAssistantStore } from "../../stores/assistant-store";
import { useSettings } from "../../hooks/core/use-settings";
import { Button } from "../primitives/Button";
import { Tip } from "../primitives/Tooltip";
import { CaptureRow } from "./CaptureRow";
import { KBD } from "./CaptureInput";
import { CaptureDayChips } from "./CaptureDayChips";
import type { LocalDate, WallTime } from "@cadence/domain/time";
import { dayOfInstant, fromTimeValue, nlpClock, toDay } from "../../lib/utils/date-format";
import { today } from "../../lib/utils/user-zone";
import { useWeekLoad, usePlaceTask } from "./PlaceSheet";
import { toast } from "sonner";
import { toastUndo } from "../../lib/utils/undo-toast";
import { useUnprocessInbox } from "../../hooks/inbox/use-unprocess-inbox";
import { overridesOf, placementFor } from "../../lib/utils/task/suggested-placement";
import { useProjects } from "../../hooks/projects/use-projects";
import { Reveal } from "../shared/Reveal";
import { computeNlp, loadParse, TASK_FIELDS, useParseModule, type ParseFn } from "../../hooks/use-nlp-parse";

/** Explicit nulls: the server must not infer a day from a thought's words. */
const NO_DAY = { dueDate: null, scheduledStart: null, scheduledEnd: null };

export function HoldingFeed({
    onSelectTask,
    onClarifyInboxItem,
    view = "list",
}: {
    onSelectTask: (id: string) => void;
    onClarifyInboxItem: (id: string) => void;
    /** Desktop Rows / Board; compact shells always get rows. */
    view?: "list" | "kanban";
}) {
    const feed = useCaptureFeed();
    const { isTouch } = useShellMode();
    const { lightest } = useWeekLoad(today());
    const { captureOrder, activeDefinition } = useFocusViewStore();
    const { data: settings } = useSettings();
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const process = useProcessInboxToTask();
    const { data: projects = [] } = useProjects();
    const unprocess = useUnprocessInbox();
    const status = useCaptureActions();
    const updateTask = useUpdateTask();
    const placeTask = usePlaceTask();
    const openAssistant = useAssistantStore((s) => s.requestMessage);
    const definition = settings?.tasks.intelligence?.focusViewsEnabled === false ? null : activeDefinition;
    // Only priority order and focus views read what a thought says; chronological order never parses.
    const parse = useParseModule(captureOrder === "priority" || Boolean(definition));
    const ordered = useMemo(() => {
        const rank = (item: InboxItem) => {
            if (!parse) return { item, priority: 0, effort: null, state: "ACTIVE", projectId: null, dueDate: null, scheduledStart: null };
            const parsed = parse({
                input: item.rawText,
                sourceSurface: "inbox",
                clock: nlpClock(),
                dateStyle: settings?.dateTime.dateStyle,
            });
            const priority = parsed.entities.find((e) => e.type === "priority")?.normalizedValue as number | undefined;
            const effort = /\b(deep|hard|demanding)\b/i.test(item.rawText)
                ? 3
                : /\b(quick|easy|light)\b/i.test(item.rawText)
                  ? 1
                  : null;
            const day = parsed.entities.find((e) => e.type === "due_date" || e.type === "scheduled_start")
                ?.normalizedValue as { date?: LocalDate; time?: WallTime | null } | undefined;
            return {
                item,
                priority: priority ?? 0,
                effort,
                state: "ACTIVE",
                projectId: null,
                // A typed time is a timed start; a bare day is the due day.
                dueDate: day?.time ? null : (day?.date ?? null),
                scheduledStart: day?.date && day.time ? fromTimeValue(day.date, day.time) : null,
            };
        };
        const compare = (a: { priority: number; createdAt: string; id: string }, b: typeof a) => {
            if (captureOrder === "priority" && a.priority !== b.priority) return b.priority - a.priority;
            const chronological = b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);
            return captureOrder === "oldest" ? -chronological : chronological;
        };
        const thoughts = (items: InboxItem[]) => {
            let ranked = items.map(rank);
            if (definition)
                ranked =
                    definition.waitingOnly || definition.projectIds.length || definition.states.includes("WAITING")
                        ? []
                        : applyFocusView(ranked, definition, { clock: nlpClock(), dayOf: dayOfInstant });
            return ranked
                .sort((a, b) => compare({ ...a.item, priority: a.priority }, { ...b.item, priority: b.priority }))
                .map((r) => r.item);
        };
        return {
            thoughts: thoughts(feed.thoughts),
            older: thoughts(feed.older),
            tasks: (definition ? applyFocusView(feed.tasks, definition, { clock: nlpClock(), dayOf: dayOfInstant }) : [...feed.tasks]).sort(compare),
        };
    }, [feed.thoughts, feed.older, feed.tasks, definition, captureOrder, settings?.dateTime.dateStyle, parse]);
    const toggle = (id: string) =>
        setSelected((old) => {
            const next = new Set(old);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    /** A thought as a task, read the way its row's Done reads it: the user's edits, then its words, then the suggested list. */
    const asTask = (item: InboxItem, parseText: ParseFn) => {
        const overrides = overridesOf(item);
        const dismissedEntityIds = (item.analysis?.dismissedEntityIds ?? []) as string[];
        const dateStyle = settings?.dateTime.dateStyle ?? "mdy";
        const draft = computeNlp(parseText, { input: item.rawText, projects, tags: [], dismissedEntityIds, sourceSurface: "inbox", dateStyle, capabilities: TASK_FIELDS });
        const where = placementFor(item, { cue: draft.projectId });
        return {
            inboxItemId: item.id,
            rawText: item.rawText,
            title: overrides.title ?? draft.cleanedTitle,
            projectId: where?.projectId ?? null,
            sectionId: where?.sectionId ?? null,
            tagIds: overrides.tagIds,
            reminderAt: draft.fields.reminderAt,
            notBefore: draft.fields.notBefore,
            nlp: { rawInput: item.rawText, sourceSurface: "inbox" as const, dateStyle, dismissedEntityIds, userOverrides: overrides },
        };
    };
    const bulk = async (date?: LocalDate, discard = false) => {
        if (busy) return;
        setBusy(true);
        try {
            const parseText = await loadParse();
            for (const item of [...feed.thoughts, ...feed.older, ...feed.notes].filter((i) => selected.has(i.id))) {
                if (discard) await status.setStatus(item, "discarded");
                else await process.mutateAsync({ ...asTask(item, parseText), ...(date ? { scheduledDay: date } : NO_DAY) });
                setSelected((old) => {
                    const next = new Set(old);
                    next.delete(item.id);
                    return next;
                });
            }
            for (const task of feed.tasks.filter((t) => selected.has(t.id))) {
                if (discard) {
                    await updateTask.mutateAsync({ id: task.id, state: "ARCHIVED" });
                    toast.message("Discarded", {
                        action: {
                            label: "Undo",
                            onClick: () => updateTask.mutate({ id: task.id, state: task.state }),
                        },
                    });
                } else if (date) await placeTask(task, date);
                setSelected((old) => {
                    const next = new Set(old);
                    next.delete(task.id);
                    return next;
                });
            }
        } catch {
            toast.error("Some items couldn't be changed. They remain selected.");
        } finally {
            setBusy(false);
        }
    };
    // Thoughts that already carry a list (and section): the user's pick, or the server's suggestion.
    const sortable = [...feed.thoughts, ...feed.older].filter((item) => placementFor(item));
    const sortAll = async () => {
        if (busy || sortable.length === 0) return;
        setBusy(true);
        const placed: { item: InboxItem; taskId: string }[] = [];
        try {
            const parseText = await loadParse();
            for (const item of sortable) {
                // Sorting never picks a day.
                const task = await process.mutateAsync({ ...asTask(item, parseText), ...NO_DAY, silent: true });
                if (task) placed.push({ item, taskId: task.id });
            }
        } catch {
            toast.error("Some thoughts couldn't be sorted. They stay in New.");
        } finally {
            setBusy(false);
        }
        if (placed.length)
            toastUndo(
                `Sorted ${placed.length} ${placed.length === 1 ? "thought" : "thoughts"}`,
                () => placed.forEach(({ item, taskId }) => unprocess.mutate({ id: item.id, taskId, item })),
                { description: "Placed in their lists, no day yet" },
            );
    };
    const available = [...ordered.thoughts, ...ordered.tasks, ...ordered.older, ...feed.notes];
    const activeId = available.some((item) => item.id === focusedId) ? focusedId : available[0]?.id;
    const board = view === "kanban";
    const { data: subtasksByTaskId = {} } = useSubtasksByTaskIds(ordered.tasks.map((t) => t.id));
    const rows = (items: InboxItem[]) =>
        items.map((item) => (
            <CaptureRow
                key={item.id}
                item={item}
                lightest={lightest}
                onOpen={() => onClarifyInboxItem(item.id)}
                selected={selected.has(item.id)}
                onToggleSelection={() => toggle(item.id)}
                tabIndex={activeId === item.id ? 0 : -1}
                onFocusRow={() => setFocusedId(item.id)}
                stacked={board}
            />
        ));
    const toolbar = selected.size > 0 && (
        <div
            role="toolbar"
            aria-label="Selected thoughts and tasks"
            data-capture-selection
            className="layer-floating-bar mobile-floating-action fixed bottom-8 left-1/2 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl border border-twilight-border bg-twilight-surface p-2 shadow-2xl animate-in fade-in slide-in-from-bottom-5 duration-300"
        >
            <span className="flex h-9 items-center rounded-full bg-accent-primary/20 px-3 text-xs font-semibold tabular-nums text-accent-primary">
                {selected.size} selected
            </span>
            {/* Phone: count and actions share the top line, the day pills get their own below. */}
            <div className="order-last basis-full sm:order-none sm:basis-auto">
                <CaptureDayChips lightest={lightest} onPlace={(day) => void bulk(toDay(day))} disabled={busy} />
            </div>
            <Button
                disabled={busy}
                variant="ghost"
                size="sm"
                className="ml-auto text-red-400/80 hover:bg-red-500/10 hover:text-red-300 sm:ml-0"
                onClick={() => void bulk(undefined, true)}
            >
                <Trash2 size={14} aria-hidden />
                Discard
            </Button>
            <Tip label="Clear selection" side="top">
                <Button variant="ghost" size="icon" aria-label="Clear selection" onClick={() => setSelected(new Set())}>
                    <X size={16} aria-hidden />
                </Button>
            </Tip>
        </div>
    );
    const sortAction = feed.thoughts.length >= 5 && (
        <Button
            variant="subtle"
            size="sm"
            className="shrink-0 px-2.5"
            onClick={() =>
                openAssistant(
                    "Sort these thoughts in Capture with me. Suggest groups and task details for my approval. Leave kept notes alone unless I ask.",
                )
            }
        >
            Sort these with Cadence
        </Button>
    );
    const thoughtsAction = (sortable.length > 0 || sortAction) && (
        <div className="flex flex-wrap items-center gap-2">
            {sortable.length > 0 && (
                <Button variant="subtle" size="sm" className="shrink-0 px-2.5" disabled={busy} onClick={() => void sortAll()}>
                    Sort all
                </Button>
            )}
            {sortAction}
        </div>
    );
    const taskRows = (
        <>
            {ordered.tasks.map((task) => (
                <CaptureRow
                    key={task.id}
                    task={task}
                    subtasks={subtasksByTaskId[task.id]}
                    lightest={lightest}
                    onOpen={() => onSelectTask(task.id)}
                    selected={selected.has(task.id)}
                    onToggleSelection={() => toggle(task.id)}
                    tabIndex={activeId === task.id ? 0 : -1}
                    onFocusRow={() => setFocusedId(task.id)}
                    stacked={board}
                />
            ))}
        </>
    );
    const empty = (text: string) => <p className="py-4 text-sm text-twilight-text-muted">{text}</p>;
    if (board)
        return (
            <>
                {toolbar}
                <BucketedCollectionView
                    view="kanban"
                    desktopColumnScroll
                    sections={[
                        {
                            key: "new",
                            title: "New",
                            icon: Inbox,
                            accentClass: "text-twilight-text-soft",
                            count: ordered.thoughts.length,
                            headerAction: thoughtsAction || undefined,
                            listContent: null,
                            boardContent: (
                                <div className="space-y-2">
                                    {rows(ordered.thoughts)}
                                    {!ordered.thoughts.length && empty("Nothing new. Add a thought whenever you need.")}
                                    {ordered.older.length > 0 && (
                                        <Fold title="Older" count={ordered.older.length}>
                                            {rows(ordered.older)}
                                        </Fold>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: "no-day",
                            title: "No day yet",
                            icon: CalendarClock,
                            accentClass: "text-twilight-text-soft",
                            count: ordered.tasks.length,
                            listContent: null,
                            boardContent: (
                                <div className="space-y-2">
                                    {taskRows}
                                    {!ordered.tasks.length && empty("No tasks waiting for a day.")}
                                </div>
                            ),
                        },
                        ...(feed.notes.length
                            ? [
                                  {
                                      key: "notes",
                                      title: "Notes",
                                      icon: StickyNote,
                                      accentClass: "text-twilight-text-soft",
                                      count: feed.notes.length,
                                      listContent: null,
                                      boardContent: <div className="space-y-2">{rows(feed.notes)}</div>,
                                  },
                              ]
                            : []),
                    ]}
                />
            </>
        );
    return (
        <div className="flex min-w-0 flex-col gap-6 pb-24">
            {toolbar}
            <section aria-label="New" className="surface-card flex flex-col gap-3 rounded-[28px] px-3 py-4 sm:px-4">
                <BucketedSectionHeader
                    title="New"
                    icon={Inbox}
                    accentClass="text-twilight-text-soft"
                    count={ordered.thoughts.length}
                    headerAction={thoughtsAction || undefined}
                />
                <div className="space-y-2">{rows(ordered.thoughts)}</div>
                {!ordered.thoughts.length && (
                    <p className="py-4 text-sm text-twilight-text-muted">
                        Nothing new. Add a thought whenever you need.
                    </p>
                )}
            </section>
            <section aria-label="No day yet" className="surface-card flex flex-col gap-3 rounded-[28px] px-3 py-4 sm:px-4">
                <BucketedSectionHeader
                    title="No day yet"
                    icon={CalendarClock}
                    accentClass="text-twilight-text-soft"
                    count={ordered.tasks.length}
                />
                <div className="space-y-2">
                    {ordered.tasks.map((task) => (
                        <CaptureRow
                            key={task.id}
                            task={task}
                            subtasks={subtasksByTaskId[task.id]}
                            lightest={lightest}
                            onOpen={() => onSelectTask(task.id)}
                            selected={selected.has(task.id)}
                            onToggleSelection={() => toggle(task.id)}
                            tabIndex={activeId === task.id ? 0 : -1}
                            onFocusRow={() => setFocusedId(task.id)}
                        />
                    ))}
                </div>
                {!ordered.tasks.length && (
                    <p className="py-4 text-sm text-twilight-text-muted">No tasks waiting for a day.</p>
                )}
            </section>
            {ordered.older.length > 0 && (
                <Fold title="Older" count={ordered.older.length}>
                    {rows(ordered.older)}
                </Fold>
            )}
            {feed.notes.length > 0 && (
                <Fold title="Notes" count={feed.notes.length}>
                    {rows(feed.notes)}
                </Fold>
            )}
            {!isTouch && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-twilight-text-muted">
                    {SHORTCUTS.map(([key, label]) => (
                        <span key={key} className="inline-flex items-center gap-1.5">
                            <kbd className={KBD}>{key}</kbd>
                            {label}
                        </span>
                    ))}
                </p>
            )}
        </div>
    );
}

const SHORTCUTS = [
    ["1", "Today"],
    ["2", "Tomorrow"],
    ["3", "No day yet"],
    ["x", "Tick off"],
    ["↵", "Details"],
    ["⌫", "Discard"],
    ["Space", "Select"],
] as const;

/** A folded group styled like the section headers above it. */
function Fold({ title, count, children }: { title: string; count: number; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <div className="surface-card rounded-[28px] px-3 py-2 sm:px-4">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                aria-expanded={open}
                aria-controls={id}
                className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
            >
                <ChevronRight
                    size={14}
                    aria-hidden
                    className={`text-twilight-text-soft transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                />
                <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-twilight-text">
                    {title}
                </span>
                <span className="ml-1 text-[12px] tabular-nums text-twilight-text-soft/90">{count}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
            </button>
            <Reveal open={open} id={id}>
                <div className="mb-2 mt-1 space-y-2">{children}</div>
            </Reveal>
        </div>
    );
}
