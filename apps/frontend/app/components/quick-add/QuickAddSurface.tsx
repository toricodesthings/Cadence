import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import { Dialog, DialogContent } from "../primitives/Dialog";
import { useShellMode } from "../../hooks/use-shell-mode";
import { useCreateTask } from "../../hooks/tasks/use-create-task";
import { useCreateInboxItem } from "../../hooks/inbox/use-create-inbox-item";
import { useCreateHabit } from "../../hooks/habits/use-create-habit";
import { useTasks } from "../../hooks/tasks/use-tasks";
import { computeNextOrderIndex } from "../../lib/utils/order-index";
import { CadencePicker } from "../habits/CadencePicker";
import { buildFocusSearchParams } from "../../hooks/use-route-focus";
import { useSettings } from "../../hooks/use-settings";
import { resolveDefaultDueDate, mapPriorityNameToNumber } from "../../lib/utils/task-defaults";
import { toast } from "sonner";
import { CheckSquare, MessageSquare, Flame } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────

type QuickAddTab = "task" | "capture" | "habit";

interface QuickAddSurfaceProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const TABS: { key: QuickAddTab; label: string; icon: React.ReactNode }[] = [
    { key: "task", label: "Task", icon: <CheckSquare size={14} aria-hidden="true" /> },
    { key: "capture", label: "Thought", icon: <MessageSquare size={14} aria-hidden="true" /> },
    { key: "habit", label: "Habit", icon: <Flame size={14} aria-hidden="true" /> },
];

// ── Main Surface ──────────────────────────────────────────────────

export function QuickAddSurface({ open, onOpenChange }: QuickAddSurfaceProps) {
    const [tab, setTab] = useState<QuickAddTab>("task");

    // Reset to task tab when opening
    useEffect(() => {
        if (open) setTab("task");
    }, [open]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                hideCloseButton
                className="fixed inset-x-auto bottom-auto left-1/2 top-[18%] -translate-x-1/2 translate-y-0 w-full max-w-md rounded-2xl border border-twilight-border surface-utility shadow-2xl p-0 overflow-hidden"
            >
                {/* Header */}
                <div className="border-b border-twilight-border px-5 pt-5 pb-4">
                    <h2 className="font-display text-base font-semibold text-twilight-text tracking-tight">
                        Quick Add
                    </h2>
                    <p className="text-sm text-twilight-text-muted/60 mt-1">
                        Capture without leaving your flow
                    </p>
                </div>

                {/* Tab switcher */}
                <div className="flex border-b border-twilight-border">
                    {TABS.map(({ key, label, icon }) => (
                        <button
                            key={key}
                            onClick={() => setTab(key)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors cursor-pointer
                                ${tab === key
                                    ? "text-lantern border-b-2 border-lantern bg-lantern/[0.04]"
                                    : "text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.03]"
                                }
                            `}
                        >
                            {icon}
                            {label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="p-5">
                    {tab === "task" && <TaskForm onClose={() => onOpenChange(false)} />}
                    {tab === "capture" && <CaptureForm onClose={() => onOpenChange(false)} />}
                    {tab === "habit" && <HabitForm onClose={() => onOpenChange(false)} />}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ── Task Form ─────────────────────────────────────────────────────

function TaskForm({ onClose }: { onClose: () => void }) {
    const [title, setTitle] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const createTask = useCreateTask();
    const { data: tasks = [] } = useTasks({});
    const { data: userSettings } = useSettings();
    const taskDefaults = userSettings?.tasks;

    useEffect(() => {
        requestAnimationFrame(() => inputRef.current?.focus());
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = title.trim();
        if (!trimmed) return;

        const placement = taskDefaults?.newTaskPlacement ?? "bottom";
        const orderIndex = placement === "top" ? 0 : computeNextOrderIndex(tasks);
        const priority = mapPriorityNameToNumber(taskDefaults?.defaultPriority);
        const dueDate = resolveDefaultDueDate(taskDefaults?.defaultDueDate);

        createTask.mutate(
            {
                title: trimmed,
                orderIndex,
                ...(priority > 0 && { priority }),
                ...(dueDate && { dueDate }),
            },
            {
                onSuccess: (created) => {
                    if (!created) return; // Queued offline
                    toast.success("Task added to Holding");
                    onClose();
                    const focusParams = buildFocusSearchParams({
                        focusKind: "task",
                        focusId: created.id,
                        focusScope: "holding-unmanaged",
                        focusSource: "quick-add",
                    });
                    navigate(`/?${focusParams}`);
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
                className="w-full rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-lantern/30 focus:ring-1 focus:ring-lantern/20 transition-colors"
                autoFocus
            />
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
                    className="rounded-xl bg-lantern/15 px-4 py-2 text-sm font-medium text-lantern hover:bg-lantern/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                    {createTask.isPending ? "Adding…" : "Add Task"}
                </button>
            </div>
        </form>
    );
}

// ── Capture / Thought Dump Form ───────────────────────────────────

function CaptureForm({ onClose }: { onClose: () => void }) {
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

        createInbox.mutate(trimmed, {
            onSuccess: (created) => {
                if (!created) return; // Queued offline
                toast.success("Thought saved to Holding");
                onClose();
                const focusParams = buildFocusSearchParams({
                    focusKind: "inbox",
                    focusId: created.id,
                    focusScope: "holding-captures",
                    focusSource: "quick-add",
                });
                navigate(`/?${focusParams}`);
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
                className="w-full rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-lantern/30 focus:ring-1 focus:ring-lantern/20 transition-colors resize-none"
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
                        className="rounded-xl bg-lantern/15 px-4 py-2 text-sm font-medium text-lantern hover:bg-lantern/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {createInbox.isPending ? "Saving…" : "Save Thought"}
                    </button>
                </div>
            </div>
        </form>
    );
}

// ── Habit Form ────────────────────────────────────────────────────

function HabitForm({ onClose }: { onClose: () => void }) {
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
                    if (!created) return; // Queued offline
                    toast.success("Habit created");
                    onClose();
                    const focusParams = buildFocusSearchParams({
                        focusKind: "habit",
                        focusId: created.id,
                        focusSource: "quick-add",
                    });
                    navigate(`/habits?${focusParams}`);
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
                className="w-full rounded-xl border border-twilight-border bg-white/[0.04] px-4 py-3 text-sm text-twilight-text placeholder:text-twilight-text-muted/50 outline-none focus:border-lantern/30 focus:ring-1 focus:ring-lantern/20 transition-colors"
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
                    className="rounded-xl bg-lantern/15 px-4 py-2 text-sm font-medium text-lantern hover:bg-lantern/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                    {createHabit.isPending ? "Creating…" : "Create Habit"}
                </button>
            </div>
        </form>
    );
}
