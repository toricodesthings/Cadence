import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft, SlidersHorizontal, MoreHorizontal,
    Zap, ChevronLeft, ChevronRight, Check, X,
    Trash2, Maximize2, Minimize2,
    Clock, Pause, Play, FolderOpen, Tag,
} from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as AlertDialog from "../primitives/AlertDialog";
import { Button } from "../primitives/Button";
import { CadencePicker } from "./CadencePicker";
import { useHabitMonthly } from "../../hooks/habits/use-habit-monthly";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { useDeleteHabit } from "../../hooks/habits/use-delete-habit";
import { usePauseHabit, useResumeHabit } from "../../hooks/habits/use-pause-habit";
import { useProjects } from "../../hooks/projects/use-projects";
import { useTags } from "../../hooks/tags/use-tags";
import { useDebouncedCallback } from "../../hooks/core/use-debounced-callback";
import type { Habit } from "@cadence/contracts/habit";
import { ImmersiveDetailLayout } from "../shared/ImmersiveDetailLayout";

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
    // 0 = Sunday
    return new Date(year, month, 1).getDay();
}

// ─── Info Row ────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start gap-3 py-2">
            <Icon size={13} className="text-twilight-text-muted/50 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/50">{label}</span>
                <div className="text-sm text-twilight-text-soft">{children}</div>
            </div>
        </div>
    );
}

// ─── Heatmap Calendar ────────────────────────────────────────────────────────

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface HeatmapCalendarProps {
    habitId: string;
    year: number;
    month: number;
    onNavigate: (delta: number) => void;
}

function HeatmapCalendar({ habitId, year, month, onNavigate }: HeatmapCalendarProps) {
    const { data, isLoading } = useHabitMonthly(habitId, year, month);

    const daysInMonth = getDaysInMonth(year, month);
    const firstDow = getFirstDayOfWeek(year, month);
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const todayDay = isCurrentMonth ? today.getDate() : -1;

    // Build flattened grid: nulls for leading blanks + 1..daysInMonth
    const cells: (number | null)[] = [
        ...Array(firstDow).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null);

    const scheduled = new Set(data?.scheduledDays ?? []);
    const logs = data?.logsByDay ?? {};

    return (
        <div className="flex flex-col gap-3">
            {/* Month nav */}
            <div className="flex items-center justify-between">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onNavigate(-1)}
                    aria-label="Previous month"
                    className="text-twilight-text-muted hover:text-twilight-text"
                >
                    <ChevronLeft size={15} />
                </Button>
                <span className="text-[13px] font-semibold text-twilight-text tabular-nums">
                    {MONTHS[month]} {year}
                </span>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onNavigate(1)}
                    aria-label="Next month"
                    className="text-twilight-text-muted hover:text-twilight-text"
                >
                    <ChevronRight size={15} />
                </Button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1">
                {DOW.map((d) => (
                    <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/50 pb-1">
                        {d}
                    </div>
                ))}

                {/* Day cells */}
                {isLoading
                    ? cells.map((_, i) => (
                        <div key={i} className="aspect-square rounded-full bg-white/[0.04] animate-pulse" />
                    ))
                    : cells.map((day, i) => {
                        if (day === null) {
                            return <div key={i} />;
                        }

                        const isScheduled = scheduled.has(day);
                        const status = logs[day];
                        const isCompleted = status === "COMPLETED";
                        const isSkipped = status === "SKIPPED";
                        const isToday = day === todayDay;

                        return (
                            <div
                                key={i}
                                title={
                                    !isScheduled
                                        ? undefined
                                        : isCompleted
                                            ? "Completed"
                                            : isSkipped
                                                ? "Skipped"
                                                : "Pending"
                                }
                                className={`
                                    relative aspect-square rounded-full flex items-center justify-center
                                    transition-colors duration-150
                                    ${isToday ? "ring-1 ring-accent-primary/60" : ""}
                                    ${isCompleted
                                        ? "bg-accent-primary/25 shadow-[0_0_8px_color-mix(in_srgb,var(--accent-primary)_15%,transparent)]"
                                        : isSkipped
                                            ? "bg-white/[0.05]"
                                            : isScheduled
                                                ? "bg-white/[0.04]"
                                                : ""}
                                `}
                            >
                                {isCompleted ? (
                                    <Check size={10} className="text-accent-primary" strokeWidth={3} />
                                ) : isSkipped ? (
                                    <X size={9} className="text-twilight-text-muted/40" />
                                ) : (
                                    <span className={`text-[11px] font-medium ${isToday
                                        ? "text-accent-primary font-bold"
                                        : isScheduled
                                            ? "text-twilight-text-soft"
                                            : "text-twilight-text-muted/30"
                                        }`}>
                                        {day}
                                    </span>
                                )}
                            </div>
                        );
                    })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-accent-primary/25" />
                    <span className="text-[10px] text-twilight-text-muted/50">Completed</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-white/[0.05]" />
                    <span className="text-[10px] text-twilight-text-muted/50">Skipped</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-white/[0.04]" />
                    <span className="text-[10px] text-twilight-text-muted/50">Scheduled</span>
                </div>
            </div>
        </div>
    );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface HabitDetailPanelProps {
    habit: Habit;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}

export function HabitDetailPanel({
    habit,
    onClose,
    detailMode = "peek",
    onDetailModeChange,
}: HabitDetailPanelProps) {
    const now = new Date();
    const [calYear, setCalYear] = useState(now.getFullYear());
    const [calMonth, setCalMonth] = useState(now.getMonth());
    const [showSettings, setShowSettings] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);

    // Notes state — synced from habit, debounce-saved
    const [notes, setNotes] = useState(habit.notes ?? "");
    useEffect(() => { setNotes(habit.notes ?? ""); }, [habit.id, habit.notes]);

    // Edit settings state
    const [editTitle, setEditTitle] = useState(habit.title);
    const [editDescription, setEditDescription] = useState(habit.description ?? "");
    const [editRrule, setEditRrule] = useState(habit.recurrenceRule);
    const [editTargetTime, setEditTargetTime] = useState(habit.targetTime ?? "");
    const [editReminder, setEditReminder] = useState(habit.reminderEnabled);
    const [editProjectId, setEditProjectId] = useState(habit.projectId ?? "");
    useEffect(() => {
        setEditTitle(habit.title);
        setEditDescription(habit.description ?? "");
        setEditRrule(habit.recurrenceRule);
        setEditTargetTime(habit.targetTime ?? "");
        setEditReminder(habit.reminderEnabled);
        setEditProjectId(habit.projectId ?? "");
    }, [habit.id]);

    const { mutate: updateHabit } = useUpdateHabit();
    const { mutate: deleteHabit } = useDeleteHabit();
    const { pause: pauseHabit } = usePauseHabit();
    const { resume: resumeHabit } = useResumeHabit();
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();

    const debouncedSaveNotes = useDebouncedCallback((value: string) => {
        updateHabit({ id: habit.id, notes: value || null });
    }, 800);

    const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNotes(e.target.value);
        debouncedSaveNotes(e.target.value);
    };

    const handleSettingsSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTitle.trim()) return;
        updateHabit({
            id: habit.id,
            title: editTitle.trim(),
            description: editDescription.trim() || null,
            recurrenceRule: editRrule,
            targetTime: editTargetTime || null,
            reminderEnabled: editReminder,
            projectId: editProjectId || null,
        });
        setShowSettings(false);
    };

    const handleDelete = () => {
        deleteHabit(habit.id);
        onClose();
    };

    const handleCalNavigate = (delta: number) => {
        setCalMonth((m) => {
            const next = m + delta;
            if (next < 0) { setCalYear((y) => y - 1); return 11; }
            if (next > 11) { setCalYear((y) => y + 1); return 0; }
            return next;
        });
    };

    const isPaused = habit.pausedUntil && new Date(habit.pausedUntil) > now;
    const linkedProject = projects.find((p) => p.id === habit.projectId);
    const habitTags = tags.filter((t) => habit.tagIds?.includes(t.id));

    return (
        <motion.div
            className="h-full overflow-hidden"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            role="complementary"
            aria-label="Habit details"
        >
            <ImmersiveDetailLayout
                mode={detailMode}
                header={(
                    <div className="flex items-center gap-2 px-5 h-14 border-b border-twilight-border shrink-0">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            aria-label="Close habit details"
                            className="w-7 h-7 shrink-0"
                        >
                            <ArrowLeft size={15} />
                        </Button>

                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-accent-primary shrink-0 shadow-[0_0_6px_color-mix(in_srgb,var(--accent-primary)_50%,transparent)]" />
                            <span className="font-display text-sm font-medium text-twilight-text truncate">
                                {habit.title}
                            </span>
                            {isPaused && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-twilight-text-muted font-medium">
                                    <Pause size={9} /> Paused
                                </span>
                            )}
                        </div>

                        {onDetailModeChange ? (
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onDetailModeChange(detailMode === "focus" ? "peek" : "focus")}
                                aria-label={detailMode === "focus" ? "Back to split view" : "Expand habit details"}
                                className={`w-7 h-7 shrink-0 ${detailMode === "focus" ? "text-accent-primary bg-accent-primary/10" : ""}`}
                            >
                                {detailMode === "focus" ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </Button>
                        ) : null}

                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowSettings((v) => !v)}
                            aria-label={showSettings ? "Hide settings" : "Edit habit settings"}
                            aria-expanded={showSettings}
                            className={`w-7 h-7 shrink-0 ${showSettings
                                ? "text-accent-primary bg-accent-primary/10"
                                : ""
                                }`}
                        >
                            <SlidersHorizontal size={14} />
                        </Button>

                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    aria-label="Habit actions"
                                    className="w-7 h-7 shrink-0"
                                >
                                    <MoreHorizontal size={15} />
                                </Button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Content align="end">
                                {isPaused ? (
                                    <DropdownMenu.Item
                                        className="flex items-center gap-2 text-[13px]"
                                        onSelect={() => resumeHabit(habit.id)}
                                    >
                                        <Play size={13} />
                                        Resume routine
                                    </DropdownMenu.Item>
                                ) : (
                                    <DropdownMenu.Item
                                        className="flex items-center gap-2 text-[13px]"
                                        onSelect={() => pauseHabit(habit.id)}
                                    >
                                        <Pause size={13} />
                                        Pause for a week
                                    </DropdownMenu.Item>
                                )}
                                <DropdownMenu.Item
                                    className="flex items-center gap-2 text-[13px] text-red-400 focus:text-red-400 focus:bg-red-500/10"
                                    onSelect={() => setDeleteOpen(true)}
                                >
                                    <Trash2 size={13} />
                                    Delete routine
                                </DropdownMenu.Item>
                            </DropdownMenu.Content>
                        </DropdownMenu.Root>
                    </div>
                )}
            >
                <AnimatePresence initial={false}>
                    {showSettings && (
                        <motion.div
                            key="settings"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                            className="overflow-hidden shrink-0 border-b border-twilight-border"
                        >
                            <form onSubmit={handleSettingsSave} className="px-5 py-4 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                                    Name
                                </label>
                                <input
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)] transition-[border-color,box-shadow] duration-200"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                                    Purpose
                                </label>
                                <textarea
                                    rows={2}
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="Why are you building this routine?"
                                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)] transition-[border-color,box-shadow] duration-200 resize-none"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                                    Cadence
                                </label>
                                <CadencePicker value={editRrule} onChange={setEditRrule} />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                                    Target time
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="time"
                                        value={editTargetTime}
                                        onChange={(e) => setEditTargetTime(e.target.value)}
                                        className="flex-1 rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text outline-none focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)] transition-[border-color,box-shadow] duration-200"
                                    />
                                    {editTargetTime && (
                                        <button
                                            type="button"
                                            onClick={() => setEditTargetTime("")}
                                            className="px-3 py-2 rounded-xl text-[12px] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>
                            {editTargetTime && (
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editReminder}
                                        onChange={(e) => setEditReminder(e.target.checked)}
                                        className="h-5 w-5 rounded-lg border-white/[0.15] bg-white/[0.05] text-accent-primary focus:ring-accent-primary/40 accent-[var(--accent-primary)]"
                                    />
                                    <span className="text-sm text-twilight-text-soft">Remind me at this time</span>
                                </label>
                            )}
                            {projects.length > 0 && (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                                        Link to project
                                    </label>
                                    <select
                                        value={editProjectId}
                                        onChange={(e) => setEditProjectId(e.target.value)}
                                        className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text outline-none focus:border-accent-primary/30 focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent-primary)_7%,transparent)] transition-[border-color,box-shadow] duration-200 appearance-none"
                                    >
                                        <option value="">None</option>
                                        {projects.map((p) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    type="button"
                                    onClick={() => setShowSettings(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    type="submit"
                                    disabled={!editTitle.trim()}
                                    className="bg-accent-primary/20 text-accent-primary hover:bg-accent-primary/30"
                                >
                                    Save
                                </Button>
                            </div>
                            </form>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5 flex flex-col gap-6">

                {/* Identity section — title, purpose, cadence, timing, project, tags */}
                <div className="flex flex-col gap-1">
                    {habit.description && (
                        <p className="text-sm text-twilight-text-soft leading-relaxed">{habit.description}</p>
                    )}

                    <div className="flex flex-col divide-y divide-white/[0.04] mt-2">
                        <InfoRow icon={Clock} label="Cadence">
                            {habit.recurrenceRule.includes("DAILY") ? "Daily" :
                             habit.recurrenceRule.includes("WEEKLY") ? `Weekly — ${habit.recurrenceRule.match(/BYDAY=([^;]+)/)?.[1] ?? ""}` :
                             habit.recurrenceRule}
                        </InfoRow>

                        {habit.targetTime && (
                            <InfoRow icon={Clock} label="Target time">
                                {habit.targetTime}
                                {habit.reminderEnabled && (
                                    <span className="ml-2 text-[10px] text-twilight-text-muted/50">· reminder on</span>
                                )}
                            </InfoRow>
                        )}

                        {linkedProject && (
                            <InfoRow icon={FolderOpen} label="Project">
                                {linkedProject.name}
                            </InfoRow>
                        )}

                        {habitTags.length > 0 && (
                            <InfoRow icon={Tag} label="Tags">
                                <div className="flex flex-wrap gap-1">
                                    {habitTags.map((t) => (
                                        <span key={t.id} className="inline-flex items-center rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] text-twilight-text-muted">
                                            {t.name}
                                        </span>
                                    ))}
                                </div>
                            </InfoRow>
                        )}

                        {isPaused && habit.pausedUntil && (
                            <InfoRow icon={Pause} label="Paused until">
                                <div className="flex items-center gap-2">
                                    <span>{new Date(habit.pausedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                    <button
                                        type="button"
                                        onClick={() => resumeHabit(habit.id)}
                                        className="inline-flex items-center gap-1 rounded-full bg-accent-primary/10 px-2 py-0.5 text-[11px] font-medium text-accent-primary hover:bg-accent-primary/20 transition-colors"
                                    >
                                        <Play size={9} /> Resume
                                    </button>
                                </div>
                            </InfoRow>
                        )}
                    </div>
                </div>

                {/* Heatmap calendar */}
                <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4">
                    <HeatmapCalendar
                        habitId={habit.id}
                        year={calYear}
                        month={calMonth}
                        onNavigate={handleCalNavigate}
                    />
                </div>

                {/* Notes */}
                <div className="flex flex-col gap-2 flex-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                        Notes
                    </label>
                    <textarea
                        value={notes}
                        onChange={handleNotesChange}
                        placeholder="Reflections, intentions, context for this routine…"
                        aria-label="Habit notes"
                        className="
                            flex-1 w-full min-h-[120px] bg-transparent resize-none outline-none
                            text-sm leading-relaxed text-twilight-text
                            placeholder:text-twilight-text-muted/40
                        "
                    />
                </div>

                {/* Stats — demoted below fold */}
                <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.02] border border-white/[0.05] p-4">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/40">Stats</span>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-twilight-text-muted/60">Total check-ins</span>
                            <span className="text-twilight-text tabular-nums">{habit.totalCompletions}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-twilight-text-muted/60">Current streak</span>
                            <span className="text-twilight-text tabular-nums">{habit.currentStreak} day{habit.currentStreak !== 1 ? "s" : ""}</span>
                        </div>
                        {habit.longestStreak > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-twilight-text-muted/60">Longest streak</span>
                                <span className="text-twilight-text tabular-nums">{habit.longestStreak} day{habit.longestStreak !== 1 ? "s" : ""}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Created date */}
                <p className="text-[10px] text-twilight-text-muted/40 pb-2">
                    Created {new Date(habit.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
                </div>

                <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
                    <AlertDialog.Content>
                        <AlertDialog.Header>
                            <AlertDialog.Title>Delete "{habit.title}"?</AlertDialog.Title>
                            <AlertDialog.Description>
                                All history and logs for this habit will be permanently removed. This cannot be undone.
                            </AlertDialog.Description>
                        </AlertDialog.Header>
                        <AlertDialog.Footer>
                            <AlertDialog.Cancel asChild>
                                <Button variant="ghost" size="md">
                                    Cancel
                                </Button>
                            </AlertDialog.Cancel>
                            <AlertDialog.Action asChild>
                                <Button
                                    variant="danger"
                                    size="md"
                                    onClick={handleDelete}
                                >
                                    Delete habit
                                </Button>
                            </AlertDialog.Action>
                        </AlertDialog.Footer>
                    </AlertDialog.Content>
                </AlertDialog.Root>
            </ImmersiveDetailLayout>
        </motion.div>
    );
}
