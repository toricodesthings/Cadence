import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";
import { Inbox, CalendarClock, ChevronRight, StickyNote, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { BucketedCollectionView, BucketedSectionHeader } from "../shared/BucketedCollectionView";
import { useMemo, useState } from "react";
import { parse } from "@cadence/nlp/parse";
import { applyFocusView } from "@cadence/nlp/focus-views";
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
import { useWeekLoad, usePlaceTask } from "./PlaceSheet";
import { toast } from "sonner";

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
    const coarse = useIsCoarsePointer();
    const { lightest } = useWeekLoad(new Date());
    const { captureOrder, activeDefinition } = useFocusViewStore();
    const { data: settings } = useSettings();
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const process = useProcessInboxToTask();
    const status = useCaptureActions();
    const updateTask = useUpdateTask();
    const placeTask = usePlaceTask();
    const openAssistant = useAssistantStore((s) => s.requestMessage);
    const definition = settings?.tasks.intelligence?.focusViewsEnabled === false ? null : activeDefinition;
    const ordered = useMemo(() => {
        const rank = (item: InboxItem) => {
            const parsed = parse({
                input: item.rawText,
                sourceSurface: "inbox",
                dateStyle: settings?.dateTime.dateStyle,
            });
            const priority = parsed.entities.find((e) => e.type === "priority")?.normalizedValue as number | undefined;
            const effort = /\b(deep|hard|demanding)\b/i.test(item.rawText)
                ? 3
                : /\b(quick|easy|light)\b/i.test(item.rawText)
                  ? 1
                  : null;
            const day = parsed.entities.find((e) => e.type === "due_date" || e.type === "scheduled_start")
                ?.normalizedValue as { date?: string; datetime?: string } | undefined;
            return {
                item,
                priority: priority ?? 0,
                effort,
                state: "ACTIVE",
                projectId: null,
                dueDate: day?.date ?? null,
                scheduledStart: day?.datetime ?? null,
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
                        : applyFocusView(ranked, definition);
            return ranked
                .sort((a, b) => compare({ ...a.item, priority: a.priority }, { ...b.item, priority: b.priority }))
                .map((r) => r.item);
        };
        return {
            thoughts: thoughts(feed.thoughts),
            older: thoughts(feed.older),
            tasks: (definition ? applyFocusView(feed.tasks, definition) : [...feed.tasks]).sort(compare),
        };
    }, [feed.thoughts, feed.older, feed.tasks, definition, captureOrder, settings?.dateTime.dateStyle]);
    const toggle = (id: string) =>
        setSelected((old) => {
            const next = new Set(old);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const bulk = async (date?: string, discard = false) => {
        if (busy) return;
        setBusy(true);
        try {
            for (const item of [...feed.thoughts, ...feed.older, ...feed.notes].filter((i) => selected.has(i.id))) {
                if (discard) await status.setStatus(item, "discarded");
                else {
                    const overrides = item.analysis?.userOverrides as
                        | { title?: string; projectId?: string | null; tagIds?: string[] }
                        | undefined;
                    await process.mutateAsync({
                        inboxItemId: item.id,
                        rawText: item.rawText,
                        title:
                            overrides?.title ??
                            parse({
                                input: item.rawText,
                                sourceSurface: "inbox",
                                dateStyle: settings?.dateTime.dateStyle,
                            }).cleanedTitle,
                        projectId: overrides?.projectId,
                        tagIds: overrides?.tagIds,
                        nlp: {
                            rawInput: item.rawText,
                            sourceSurface: "inbox",
                            dateStyle: settings?.dateTime.dateStyle ?? "mdy",
                            dismissedEntityIds: (item.analysis?.dismissedEntityIds ?? []) as string[],
                            userOverrides: overrides ?? {},
                        },
                        ...(date ? { scheduledDate: date } : { isAllDay: true, dueDate: null, scheduledStart: null }),
                    });
                }
                setSelected((old) => {
                    const next = new Set(old);
                    next.delete(item.id);
                    return next;
                });
            }
            for (const task of feed.tasks.filter((t) => selected.has(t.id))) {
                if (discard) {
                    await updateTask.mutateAsync({ id: task.id, state: "ARCHIVED" });
                    toast("Discarded", {
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
                <CaptureDayChips lightest={lightest} onPlace={(date) => void bulk(date)} disabled={busy} />
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
                            headerAction: sortAction || undefined,
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
            <section aria-label="New" className="flex flex-col gap-3">
                <BucketedSectionHeader
                    title="New"
                    icon={Inbox}
                    accentClass="text-twilight-text-soft"
                    count={ordered.thoughts.length}
                    headerAction={sortAction}
                />
                <div className="space-y-2">{rows(ordered.thoughts)}</div>
                {!ordered.thoughts.length && (
                    <p className="py-4 text-sm text-twilight-text-muted">
                        Nothing new. Add a thought whenever you need.
                    </p>
                )}
            </section>
            <section aria-label="No day yet" className="flex flex-col gap-3">
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
            {!coarse && (
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
    return (
        <details className="group/fold">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 [&::-webkit-details-marker]:hidden">
                <ChevronRight
                    size={14}
                    aria-hidden
                    className="text-twilight-text-soft transition-transform duration-200 group-open/fold:rotate-90"
                />
                <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-twilight-text">
                    {title}
                </span>
                <span className="ml-1 text-[12px] tabular-nums text-twilight-text-soft/90">{count}</span>
                <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-twilight-border/20 to-transparent" />
            </summary>
            <div className="mt-3 space-y-2">{children}</div>
        </details>
    );
}
