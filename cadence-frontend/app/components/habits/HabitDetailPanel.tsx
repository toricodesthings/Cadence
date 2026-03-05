import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft, SlidersHorizontal, MoreHorizontal,
    Flame, Zap, ChevronLeft, ChevronRight, Check, X,
    Trash2, Pencil,
} from "lucide-react";
import * as DropdownMenu from "../primitives/DropdownMenu";
import * as Dialog from "../primitives/Dialog";
import * as AlertDialog from "../primitives/AlertDialog";
import { CadencePicker } from "./CadencePicker";
import { useHabitMonthly } from "../../hooks/habits/use-habit-monthly";
import { useUpdateHabit } from "../../hooks/habits/use-update-habit";
import { useDeleteHabit } from "../../hooks/habits/use-delete-habit";
import { useDebouncedCallback } from "../../hooks/use-debounced-callback";
import type { Habit } from "../../types/habit";

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

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
    icon: Icon,
    label,
    value,
    accent = false,
}: {
    icon: React.ElementType;
    label: string;
    value: string | number;
    accent?: boolean;
}) {
    return (
        <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] border border-white/[0.07] p-4">
            <div className="flex items-center gap-2">
                <Icon
                    size={13}
                    className={accent ? "text-lantern/80" : "text-twilight-text-muted/60"}
                />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                    {label}
                </span>
            </div>
            <p className={`font-display text-xl font-semibold leading-none ${accent ? "text-lantern" : "text-twilight-text"}`}>
                {value}
            </p>
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
                <button
                    type="button"
                    onClick={() => onNavigate(-1)}
                    className="btn-icon text-twilight-text-muted hover:text-twilight-text"
                    aria-label="Previous month"
                >
                    <ChevronLeft size={15} />
                </button>
                <span className="text-[13px] font-semibold text-twilight-text tabular-nums">
                    {MONTHS[month]} {year}
                </span>
                <button
                    type="button"
                    onClick={() => onNavigate(1)}
                    className="btn-icon text-twilight-text-muted hover:text-twilight-text"
                    aria-label="Next month"
                >
                    <ChevronRight size={15} />
                </button>
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
                                    ${isToday ? "ring-1 ring-lantern/60" : ""}
                                    ${isCompleted
                                        ? "bg-lantern/25 shadow-[0_0_8px_rgba(232,164,74,0.15)]"
                                        : isSkipped
                                            ? "bg-white/[0.05]"
                                            : isScheduled
                                                ? "bg-white/[0.04]"
                                                : ""}
                                `}
                            >
                                {isCompleted ? (
                                    <Check size={10} className="text-lantern" strokeWidth={3} />
                                ) : isSkipped ? (
                                    <X size={9} className="text-twilight-text-muted/40" />
                                ) : (
                                    <span className={`text-[11px] font-medium ${isToday
                                            ? "text-lantern font-bold"
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
                    <div className="w-3 h-3 rounded-full bg-lantern/25" />
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
}

export function HabitDetailPanel({ habit, onClose }: HabitDetailPanelProps) {
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
    useEffect(() => {
        setEditTitle(habit.title);
        setEditDescription(habit.description ?? "");
        setEditRrule(habit.recurrenceRule);
    }, [habit.id]);

    const { mutate: updateHabit } = useUpdateHabit();
    const { mutate: deleteHabit } = useDeleteHabit();

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

    // Monthly stats derived from the habit object (backend-computed counters)
    // Monthly rate: completions this month / scheduled days this month (approximate via totalCompletions / age)
    const createdAt = new Date(habit.createdAt);
    const ageMonths = Math.max(1,
        (now.getFullYear() - createdAt.getFullYear()) * 12 +
        (now.getMonth() - createdAt.getMonth()) + 1
    );
    const monthlyAvg = Math.round(habit.totalCompletions / ageMonths);
    const monthlyRate = habit.totalCompletions > 0
        ? Math.min(100, Math.round((habit.totalCompletions / Math.max(1, ageMonths * 30)) * 100))
        : 0;

    return (
        <motion.div
            className="h-full flex flex-col bg-twilight-deep overflow-hidden"
            initial={{ x: 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 40, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            role="complementary"
            aria-label="Habit details"
        >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-5 h-14 border-b border-twilight-border shrink-0">
                <button
                    onClick={onClose}
                    aria-label="Close habit details"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors shrink-0"
                >
                    <ArrowLeft size={15} />
                </button>

                {/* Lantern dot + title */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-lantern shrink-0 shadow-[0_0_6px_rgba(232,164,74,0.5)]" />
                    <span className="font-display text-sm font-medium text-twilight-text truncate">
                        {habit.title}
                    </span>
                </div>

                {/* Settings toggle */}
                <button
                    onClick={() => setShowSettings((v) => !v)}
                    aria-label={showSettings ? "Hide settings" : "Edit habit settings"}
                    aria-expanded={showSettings}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0 ${showSettings
                            ? "text-lantern bg-lantern/10"
                            : "text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06]"
                        }`}
                >
                    <SlidersHorizontal size={14} />
                </button>

                {/* ⋯ menu */}
                <DropdownMenu.Root>
                    <DropdownMenu.Trigger asChild>
                        <button
                            aria-label="Habit actions"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors shrink-0"
                        >
                            <MoreHorizontal size={15} />
                        </button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                        <DropdownMenu.Item
                            className="flex items-center gap-2 text-[13px] text-red-400 focus:text-red-400 focus:bg-red-500/10"
                            onSelect={() => setDeleteOpen(true)}
                        >
                            <Trash2 size={13} />
                            Delete habit
                        </DropdownMenu.Item>
                    </DropdownMenu.Content>
                </DropdownMenu.Root>
            </div>

            {/* ── Settings panel (collapsible) ───────────────────────────── */}
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
                                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none focus:border-lantern/30 focus:shadow-[0_0_0_3px_rgba(232,164,74,0.07)] transition-[border-color,box-shadow] duration-200"
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
                                    placeholder="Why are you building this habit?"
                                    className="w-full rounded-2xl bg-white/[0.05] border border-white/[0.08] px-4 py-2.5 text-sm text-twilight-text placeholder:text-twilight-text-muted/40 outline-none focus:border-lantern/30 focus:shadow-[0_0_0_3px_rgba(232,164,74,0.07)] transition-[border-color,box-shadow] duration-200 resize-none"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-semibold uppercase tracking-widest text-twilight-text-muted/60">
                                    Cadence
                                </label>
                                <CadencePicker value={editRrule} onChange={setEditRrule} />
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowSettings(false)}
                                    className="px-3 py-1.5 rounded-xl text-[13px] text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!editTitle.trim()}
                                    className="px-3 py-1.5 rounded-xl text-[13px] bg-lantern/20 text-lantern hover:bg-lantern/30 transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Scrollable body ────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto scrollbar-none px-5 py-5 flex flex-col gap-6">

                {/* Stats grid — 2×2 */}
                <div className="grid grid-cols-2 gap-2">
                    <StatCard
                        icon={Flame}
                        label="Monthly avg"
                        value={`${monthlyAvg} day${monthlyAvg !== 1 ? "s" : ""}`}
                        accent
                    />
                    <StatCard
                        icon={Zap}
                        label="Total check-ins"
                        value={`${habit.totalCompletions}`}
                    />
                    <StatCard
                        icon={Flame}
                        label="Monthly rate"
                        value={`${monthlyRate}%`}
                    />
                    <StatCard
                        icon={Flame}
                        label="Current streak"
                        value={`${habit.currentStreak} day${habit.currentStreak !== 1 ? "s" : ""}`}
                        accent={habit.currentStreak > 0}
                    />
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
                        placeholder="Reflections, intentions, context for this habit…"
                        aria-label="Habit notes"
                        className="
                            flex-1 w-full min-h-[120px] bg-transparent resize-none outline-none
                            text-sm leading-relaxed text-twilight-text
                            placeholder:text-twilight-text-muted/40
                        "
                    />
                </div>

                {/* Created date */}
                <p className="text-[10px] text-twilight-text-muted/40 pb-2">
                    Created {new Date(habit.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    {habit.longestStreak > 0 && ` · Longest streak: ${habit.longestStreak} day${habit.longestStreak !== 1 ? "s" : ""}`}
                </p>
            </div>

            {/* ── Delete confirmation ────────────────────────────────────── */}
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
                            <button className="px-4 py-2 rounded-xl text-sm text-twilight-text-muted hover:text-twilight-text hover:bg-white/[0.06] transition-colors cursor-pointer">
                                Cancel
                            </button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 rounded-xl text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors cursor-pointer"
                            >
                                Delete habit
                            </button>
                        </AlertDialog.Action>
                    </AlertDialog.Footer>
                </AlertDialog.Content>
            </AlertDialog.Root>
        </motion.div>
    );
}
