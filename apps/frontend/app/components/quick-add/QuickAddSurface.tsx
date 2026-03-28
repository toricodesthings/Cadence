import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Dialog, DialogContent } from "../primitives/Dialog";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { useTags } from "../../hooks/tags";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useTasks } from "../../hooks/tasks/use-tasks";
import { useProjects } from "../../hooks/projects";
import { computeNextOrderIndex } from "../../lib/utils/order-index";
import { CadencePicker } from "../habits/CadencePicker";
import { buildFocusSearchParams } from "../../hooks/search/use-route-focus";
import { useSettings } from "../../hooks/core/use-settings";
import { resolveDefaultDueDate, mapPriorityNameToNumber } from "../../lib/utils/task/task-defaults";
import { buildCanonicalNlpEnvelope } from "../../lib/nlp/build-canonical-envelope";
import { toast } from "sonner";
import { CheckSquare, MessageSquare, Flame } from "lucide-react";
import { QuickAddActionTray } from "../tasks/QuickAddActionTray";
import { ParseSummaryChips } from "../tasks/ParseSummaryChips";
import { useNlpParse } from "../../hooks/use-nlp-parse";
import { trackUsageEvent } from "../../lib/api/track-event";

// ── Types ─────────────────────────────────────────────────────────

export type QuickAddTab = "task" | "capture" | "habit";

type QuickAddMode = "dialog" | "standalone";

interface QuickAddSurfaceProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialTab?: QuickAddTab;
    mode?: QuickAddMode;
    onComplete?: (route: string) => void;
}

const TABS: { key: QuickAddTab; label: string; icon: React.ReactNode }[] = [
    { key: "task", label: "Task", icon: <CheckSquare size={14} aria-hidden="true" /> },
    { key: "capture", label: "Thought", icon: <MessageSquare size={14} aria-hidden="true" /> },
    { key: "habit", label: "Habit", icon: <Flame size={14} aria-hidden="true" /> },
];

// ── Main Surface ──────────────────────────────────────────────────

export function QuickAddSurface({
    open,
    onOpenChange,
    initialTab = "task",
    mode = "dialog",
    onComplete,
}: QuickAddSurfaceProps) {
    const [tab, setTab] = useState<QuickAddTab>("task");

    // Reset to task tab when opening
    useEffect(() => {
        if (open) setTab(initialTab);
    }, [initialTab, open]);

    const shell = (
        <div className="overflow-hidden rounded-[1.75rem] border border-twilight-border bg-twilight-deep/96 p-0 shadow-[0_24px_72px_rgba(0,0,0,0.42)]">
            <div className="border-b border-twilight-border px-5 pb-4 pt-5">
                <h2 className="font-display text-base font-semibold tracking-tight text-twilight-text">
                    Quick Add
                </h2>
                <p className="mt-1 text-sm text-twilight-text-muted/60">
                    Capture without leaving your flow
                </p>
            </div>

            <div className="flex border-b border-twilight-border">
                {TABS.map(({ key, label, icon }) => (
                    <button
                        key={key}
                        onClick={() => setTab(key)}
                        className={`flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors cursor-pointer
                            ${tab === key
                                ? "border-b-2 border-accent-primary bg-accent-primary/[0.04] text-accent-primary"
                                : "text-twilight-text-muted hover:bg-white/[0.03] hover:text-twilight-text"
                            }
                        `}
                    >
                        {icon}
                        {label}
                    </button>
                ))}
            </div>

            <div className="p-5">
                {tab === "task" && <TaskForm onClose={() => onOpenChange(false)} onComplete={onComplete} />}
                {tab === "capture" && <CaptureForm onClose={() => onOpenChange(false)} onComplete={onComplete} />}
                {tab === "habit" && <HabitForm onClose={() => onOpenChange(false)} onComplete={onComplete} />}
            </div>
        </div>
    );

    if (mode === "standalone") {
        return shell;
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                hideCloseButton
                className="layer-utility-surface max-w-md overflow-hidden rounded-2xl border border-twilight-border p-0 shadow-2xl surface-utility"
            >
                {shell}
            </DialogContent>
        </Dialog>
    );
}

// ── Task Form ─────────────────────────────────────────────────────

function TaskForm({ onClose, onComplete }: { onClose: () => void; onComplete?: (route: string) => void }) {
    const [title, setTitle] = useState("");
    const [priority, setPriority] = useState<number | null>(null);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [tagIds, setTagIds] = useState<string[]>([]);
    const [dismissedEntityIds, setDismissedEntityIds] = useState<string[]>([]);
    const [deadline, setDeadline] = useState<{
        dueDate: string | null;
        scheduledStart: string | null;
        scheduledEnd: string | null;
        recurrenceRule: string | null;
        isAllDay: boolean;
    }>({
        dueDate: null,
        scheduledStart: null,
        scheduledEnd: null,
        recurrenceRule: null,
        isAllDay: true,
    });
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const createTask = useCreateTask();
    const { data: tasks = [] } = useTasks({});
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: userSettings } = useSettings();
    const taskDefaults = userSettings?.tasks;
    const intelligenceEnabled = taskDefaults?.intelligence?.nlpEnabled !== false;
    const autoParseOnCapture = taskDefaults?.intelligence?.autoParseOnCapture !== false;
    const showExplanations = taskDefaults?.intelligence?.showExplanations !== false;
    const confidenceThreshold = taskDefaults?.intelligence?.confidenceThreshold ?? "medium";
    const lowStimulationMode = taskDefaults?.intelligence?.lowStimulationMode ?? false;
    const dateStyle = userSettings?.dateTime?.dateStyle ?? "mdy";

    const nlp = useNlpParse({
        input: title,
        projects: projects.map((p) => ({ id: p.id, name: p.name })),
        tags: tags.map((t) => ({ id: t.id, name: t.name })),
        dismissedEntityIds,
        confidenceThreshold,
        lowStimulationMode,
        enabled: intelligenceEnabled && autoParseOnCapture,
        sourceSurface: "quick_add",
        dateStyle,
    });

    useEffect(() => {
        requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const rawTitle = title.trim();
        if (!rawTitle) return;

        const placement = taskDefaults?.newTaskPlacement ?? "bottom";
        const orderIndex = placement === "top" ? 0 : computeNextOrderIndex(tasks);
        const resolvedPriority = priority ?? nlp.priority ?? mapPriorityNameToNumber(taskDefaults?.defaultPriority);
        const hasManualSchedule = Boolean(
            deadline.dueDate || deadline.scheduledStart || deadline.scheduledEnd || deadline.recurrenceRule,
        );
        const resolvedSchedule = hasManualSchedule
            ? deadline
            : {
                dueDate: nlp.dueDate ?? resolveDefaultDueDate(taskDefaults?.defaultDueDate),
                scheduledStart: nlp.scheduledStart,
                scheduledEnd: null,
                recurrenceRule: nlp.recurrenceRule,
                isAllDay: nlp.scheduledStart ? false : true,
            };
        const resolvedProjectId = projectId ?? nlp.projectId ?? null;
        const resolvedTagIds = Array.from(new Set([...tagIds, ...nlp.tagIds]));
        const recurrenceRule = resolvedSchedule.recurrenceRule;
        const didApplyNlp = Boolean(
            (!hasManualSchedule && (nlp.dueDate || nlp.scheduledStart || nlp.recurrenceRule))
            || (priority == null && nlp.priority)
            || (!projectId && nlp.projectId)
            || nlp.tagIds.some((tagId) => !tagIds.includes(tagId))
            || nlp.waitingOn
            || nlp.durationMinutes,
        );
        const trimmed = didApplyNlp && nlp.cleanedTitle ? nlp.cleanedTitle : rawTitle;

        trackUsageEvent("task.create", { surface: "quick_add", object_type: "task" });
        createTask.mutate(
            {
                title: trimmed,
                orderIndex,
                tagIds: resolvedTagIds,
                ...(resolvedPriority > 0 && { priority: resolvedPriority as 1 | 2 | 3 | 4 }),
                ...(resolvedSchedule.dueDate && { dueDate: resolvedSchedule.dueDate }),
                ...(resolvedSchedule.scheduledStart && { scheduledStart: resolvedSchedule.scheduledStart }),
                ...(resolvedSchedule.scheduledEnd && { scheduledEnd: resolvedSchedule.scheduledEnd }),
                ...(recurrenceRule && { recurrenceRule }),
                isAllDay: resolvedSchedule.isAllDay,
                ...(resolvedProjectId && { projectId: resolvedProjectId }),
                ...(nlp.waitingOn && { waitingOn: nlp.waitingOn }),
                ...(nlp.durationMinutes && { durationEstimate: nlp.durationMinutes }),
                nlp: buildCanonicalNlpEnvelope({
                    rawInput: title,
                    sourceSurface: "quick_add",
                    dateStyle,
                    dismissedEntityIds,
                    userOverrides: {
                        title: trimmed,
                        projectId: resolvedProjectId,
                        tagIds: resolvedTagIds,
                        dueDate: resolvedSchedule.dueDate ?? null,
                        scheduledStart: resolvedSchedule.scheduledStart ?? null,
                        scheduledEnd: resolvedSchedule.scheduledEnd ?? null,
                        recurrenceRule: recurrenceRule ?? null,
                    },
                }),
            },
            {
                onSuccess: (created) => {
                    const focusParams = buildFocusSearchParams({
                        focusKind: "task",
                        focusId: created?.id ?? "",
                        focusScope: "holding-unmanaged",
                        focusSource: "quick-add",
                    });
                    const route = created ? `/?${focusParams}` : "/";

                    if (!created) {
                        toast.success("Task queued for sync");
                        onClose();
                        onComplete?.(route);
                        return;
                    }

                    toast.success("Task added to Holding");
                    setDismissedEntityIds([]);
                    onClose();
                    if (onComplete) {
                        onComplete(route);
                        return;
                    }
                    navigate(route);
                },
            },
        );
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-accent-primary/30 focus:ring-1 focus:ring-accent-primary/20 transition-colors"
                autoFocus
            />
            <QuickAddActionTray
                quickAddSettings={taskDefaults?.quickAdd}
                dueDate={deadline.dueDate ?? nlp.dueDate ?? null}
                scheduledStart={deadline.scheduledStart ?? nlp.scheduledStart ?? null}
                scheduledEnd={deadline.scheduledEnd}
                recurrenceRule={deadline.recurrenceRule ?? nlp.recurrenceRule}
                priority={priority as 1 | 2 | 3 | 4 | null}
                projectId={projectId ?? nlp.projectId ?? null}
                tagIds={Array.from(new Set([...tagIds, ...nlp.tagIds]))}
                onScheduleChange={(updates) => setDeadline({ ...deadline, ...updates })}
                onPriorityChange={(value) => setPriority(value)}
                onProjectChange={(value) => setProjectId(value)}
                onToggleTag={(tagId) =>
                    setTagIds((current) =>
                        current.includes(tagId) ? current.filter((item) => item !== tagId) : [...current, tagId],
                    )
                }
            />
            {showExplanations && (
                <ParseSummaryChips
                    parseResult={nlp.parseResult}
                    summary={nlp.summary}
                    onDismiss={(entityId) => setDismissedEntityIds((prev) => [...prev, entityId])}
                    lowStimulation={lowStimulationMode || userSettings?.appearance?.motion === "reduced"}
                    maxVisibleChips={4}
                />
            )}
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 text-sm text-twilight-text-muted hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!title.trim() || createTask.isPending}
                    className="rounded-xl bg-accent-primary/15 px-4 py-2 text-sm font-medium text-accent-primary hover:bg-accent-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                    {createTask.isPending ? "Adding…" : "Add Task"}
                </button>
            </div>
        </form>
    );
}

// ── Capture / Thought Dump Form ───────────────────────────────────

function CaptureForm({ onClose, onComplete }: { onClose: () => void; onComplete?: (route: string) => void }) {
    const [text, setText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const navigate = useNavigate();
    const createInbox = useCreateInboxItem();

    useEffect(() => {
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (!trimmed) return;

        trackUsageEvent("capture.submitted", { surface: "quick_add", object_type: "capture" });
        createInbox.mutate(trimmed, {
            onSuccess: (created) => {
                const focusParams = buildFocusSearchParams({
                    focusKind: "inbox",
                    focusId: created?.id ?? "",
                    focusScope: "holding-captures",
                    focusSource: "quick-add",
                });
                const route = created ? `/?${focusParams}` : "/";

                if (!created) {
                    toast.success("Thought queued for sync");
                    onClose();
                    onComplete?.(route);
                    return;
                }

                toast.success("Thought saved to Holding");
                onClose();
                if (onComplete) {
                    onComplete(route);
                    return;
                }
                navigate(route);
            },
        });
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Dump a thought, link, or note…"
                rows={3}
                className="w-full rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-accent-primary/30 focus:ring-1 focus:ring-accent-primary/20 transition-colors resize-none"
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSubmit(e);
                    }
                }}
                autoFocus
            />
            <div className="flex items-center justify-between">
                <span className="text-[11px] text-twilight-text-muted/50">
                    ⌘↵ to save
                </span>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-4 py-2 text-sm text-twilight-text-muted hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!text.trim() || createInbox.isPending}
                        className="rounded-xl bg-accent-primary/15 px-4 py-2 text-sm font-medium text-accent-primary hover:bg-accent-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {createInbox.isPending ? "Saving…" : "Save Thought"}
                    </button>
                </div>
            </div>
        </form>
    );
}

// ── Habit Form ────────────────────────────────────────────────────

function HabitForm({ onClose, onComplete }: { onClose: () => void; onComplete?: (route: string) => void }) {
    const [title, setTitle] = useState("");
    const [recurrenceRule, setRecurrenceRule] = useState("FREQ=DAILY");
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const createHabit = useCreateHabit();

    useEffect(() => {
        requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;

        createHabit.mutate(
            { title: trimmed, recurrenceRule },
            {
                onSuccess: (created) => {
                    const focusParams = buildFocusSearchParams({
                        focusKind: "habit",
                        focusId: created?.id ?? "",
                        focusSource: "quick-add",
                    });
                    const route = created ? `/habits?${focusParams}` : "/habits";

                    if (!created) {
                        toast.success("Habit queued for sync");
                        onClose();
                        onComplete?.(route);
                        return;
                    }

                    toast.success("Habit created");
                    onClose();
                    if (onComplete) {
                        onComplete(route);
                        return;
                    }
                    navigate(route);
                },
            },
        );
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name your habit…"
                className="w-full rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-accent-primary/30 focus:ring-1 focus:ring-accent-primary/20 transition-colors"
                autoFocus
            />

            <div>
                <label className="text-xs text-twilight-text-muted/70 font-medium mb-2 block">
                    Cadence
                </label>
                <CadencePicker value={recurrenceRule} onChange={setRecurrenceRule} />
            </div>

            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl px-4 py-2 text-sm text-twilight-text-muted hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!title.trim() || createHabit.isPending}
                    className="rounded-xl bg-accent-primary/15 px-4 py-2 text-sm font-medium text-accent-primary hover:bg-accent-primary/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                    {createHabit.isPending ? "Creating…" : "Create Habit"}
                </button>
            </div>
        </form>
    );
}
