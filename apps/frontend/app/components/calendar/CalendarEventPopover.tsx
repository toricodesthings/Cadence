import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, Clock3, Repeat, X } from "lucide-react";
import { motion } from "framer-motion";
import { useCreateTask } from "../../hooks/tasks";
import { parseLocalDate, toISODate, getDateFormatConfig } from "../../lib/utils/date-format";
import { getTaskRecurrenceSummary } from "../../lib/utils/task-scheduling";
import { useShellMode } from "../../hooks/ui/use-shell-mode";
import { TimePicker } from "../primitives";
import type { EffortLevel, TaskPriority } from "../../types/task";

export interface CalendarEventInfo {
    date: string;
    startHour: number;
    startMinute: number;
    isAllDay?: boolean;
    anchorX: number;
    anchorY: number;
}

interface CalendarEventPopoverProps {
    info: CalendarEventInfo;
    onClose: () => void;
}

type ComposerMode = "once" | "weekly";
type WeekdayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

const WEEKDAY_ORDER: WeekdayCode[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const WEEKDAY_LABELS: Record<WeekdayCode, { letter: string; long: string }> = {
    MO: { letter: "M", long: "Monday" },
    TU: { letter: "T", long: "Tuesday" },
    WE: { letter: "W", long: "Wednesday" },
    TH: { letter: "T", long: "Thursday" },
    FR: { letter: "F", long: "Friday" },
    SA: { letter: "S", long: "Saturday" },
    SU: { letter: "S", long: "Sunday" },
};

function toWeekdayCode(date: string): WeekdayCode {
    const day = new Date(`${date}T00:00:00`).getDay();
    return (["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day] ?? "MO") as WeekdayCode;
}

function formatDateLabel(date: string) {
    const config = getDateFormatConfig();
    const d = parseLocalDate(date);
    if (config.dateStyle === "dmy") {
        return d.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
        });
    }
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function formatTimeValue(hour: number, minute: number) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function addHour(timeValue: string) {
    const [hours, minutes] = timeValue.split(":").map(Number);
    const end = new Date();
    end.setHours(hours + 1, minutes, 0, 0);
    return formatTimeValue(end.getHours(), end.getMinutes());
}

function buildUntilValue(date: string) {
    const end = new Date(`${date}T23:59:59`);
    return end.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function buildWeeklyRule(days: WeekdayCode[], endDate: string | null) {
    const orderedDays = WEEKDAY_ORDER.filter((day) => days.includes(day));
    const base = `FREQ=WEEKLY;BYDAY=${orderedDays.join(",")}`;
    return endDate ? `${base};UNTIL=${buildUntilValue(endDate)}` : base;
}

function WeekdayPicker({
    value,
    onChange,
}: {
    value: WeekdayCode[];
    onChange: (days: WeekdayCode[]) => void;
}) {
    return (
        <div
            role="group"
            aria-label="Select days of the week"
            className="flex justify-center gap-2"
        >
            {WEEKDAY_ORDER.map((day) => {
                const active = value.includes(day);
                return (
                    <button
                        key={day}
                        type="button"
                        title={WEEKDAY_LABELS[day].long}
                        aria-label={WEEKDAY_LABELS[day].long}
                        aria-pressed={active}
                        onClick={() => {
                            if (active && value.length === 1) return;
                            onChange(active ? value.filter((item) => item !== day) : [...value, day]);
                        }}
                        className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200 select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lantern/50 ${
                            active
                                ? "border border-lantern/30 bg-lantern/15 text-lantern shadow-[0_0_12px_rgba(232,164,74,0.08)]"
                                : "border border-white/[0.07] bg-white/[0.04] text-twilight-text-muted hover:bg-white/[0.07] hover:text-twilight-text"
                        }`}
                    >
                        {WEEKDAY_LABELS[day].letter}
                    </button>
                );
            })}
        </div>
    );
}

export function CalendarEventPopover({ info, onClose }: CalendarEventPopoverProps) {
    const shell = useShellMode();
    const titleRef = useRef<HTMLInputElement>(null);
    const { mutate: createTask, isPending } = useCreateTask();

    const [title, setTitle] = useState("");
    const [notes, setNotes] = useState("");
    const [mode, setMode] = useState<ComposerMode>("once");
    const [startDate, setStartDate] = useState(info.date);
    const [endDate, setEndDate] = useState<string>("");
    const [hasEndDate, setHasEndDate] = useState(false);
    const [weekdays, setWeekdays] = useState<WeekdayCode[]>([toWeekdayCode(info.date)]);
    const [startTime, setStartTime] = useState(formatTimeValue(info.startHour, info.startMinute));
    const [endTime, setEndTime] = useState(addHour(formatTimeValue(info.startHour, info.startMinute)));
    const [priority, setPriority] = useState<TaskPriority>(0);
    const [effort, setEffort] = useState<EffortLevel>(null);

    useEffect(() => {
        const id = requestAnimationFrame(() => titleRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, []);

    const isDirty = Boolean(title.trim() || notes.trim() || mode === "weekly" || hasEndDate || priority > 0 || effort !== null);

    const requestClose = useCallback(() => {
        if (!isDirty || window.confirm("Discard this schedule draft?")) {
            onClose();
        }
    }, [isDirty, onClose]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                requestClose();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [requestClose]);

    const recurrenceRule = mode === "weekly" ? buildWeeklyRule(weekdays, hasEndDate ? endDate : null) : null;
    const summary = useMemo(
        () =>
            mode === "weekly"
                ? getTaskRecurrenceSummary({
                    recurrenceRule,
                    scheduledStart: new Date(`${startDate}T${startTime}:00`).toISOString(),
                    scheduledEnd: new Date(`${startDate}T${endTime}:00`).toISOString(),
                })
                : null,
        [mode, recurrenceRule, startDate, startTime, endTime],
    );

    const handleSubmit = useCallback(() => {
        if (!title.trim()) return;

        const start = new Date(`${startDate}T${startTime}:00`);
        const end = new Date(`${startDate}T${endTime}:00`);
        if (end <= start) {
            end.setDate(end.getDate() + 1);
        }

        createTask(
            {
                title: title.trim(),
                content: notes.trim() || null,
                orderIndex: Date.now(),
                dueDate: startDate,
                scheduledStart: start.toISOString(),
                scheduledEnd: end.toISOString(),
                isAllDay: false,
                timezoneLocked: mode === "weekly",
                recurrenceRule: recurrenceRule ?? undefined,
                priority,
                effort,
            },
            { onSuccess: onClose },
        );
    }, [createTask, title, notes, startDate, startTime, endTime, mode, recurrenceRule, priority, effort, onClose]);

    const popoverWidth = shell.isPhone ? window.innerWidth : 420;
    let desktopLeft = info.anchorX + 20;
    let desktopTop = info.anchorY - 40;
    if (typeof window !== "undefined" && !shell.isPhone) {
        if (desktopLeft + popoverWidth > window.innerWidth - 24) {
            desktopLeft = window.innerWidth - popoverWidth - 24;
        }
        desktopLeft = Math.max(24, desktopLeft);
        desktopTop = Math.max(24, desktopTop);
    }

    return createPortal(
        <div className="fixed inset-0 z-[120]">
            <div className="absolute inset-0 bg-[rgba(5,10,18,0.58)] backdrop-blur-md" />
            <motion.section
                initial={shell.isPhone ? { opacity: 0, y: 24 } : { opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={shell.isPhone ? { opacity: 0, y: 24 } : { opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={`absolute flex flex-col border border-white/[0.08] bg-[linear-gradient(180deg,rgba(19,31,54,0.95),rgba(11,20,36,0.98))] shadow-[0_36px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl ${
                    shell.isPhone
                        ? "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[32px]"
                        : "max-h-[calc(100dvh-48px)] rounded-[32px]"
                }`}
                style={shell.isPhone ? undefined : { left: desktopLeft, top: desktopTop, width: popoverWidth }}
                aria-label="Schedule composer"
                role="dialog"
                aria-modal="true"
            >
                {/* ── Fixed header ── */}
                <div className={shell.isPhone ? "px-5 pt-4" : "px-6 pt-5"}>
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/10 sm:hidden" />

                    <div className="flex items-center justify-between">
                        <h2 className="font-display text-lg text-twilight-text">{formatDateLabel(startDate)}</h2>
                        <button
                            type="button"
                            onClick={requestClose}
                            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text"
                            aria-label="Close composer"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* ── Scrollable body ── */}
                <div className={`flex-1 overflow-y-auto overscroll-contain scrollbar-thin ${shell.isPhone ? "px-5 py-4" : "px-6 py-4"}`}>
                    <div className="space-y-4">
                        <input
                            ref={titleRef}
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Block title\u2026"
                            className="w-full border-b border-white/[0.06] bg-transparent pb-3 font-display text-xl text-twilight-text outline-none placeholder:text-twilight-text-muted/60"
                        />

                        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-1">
                            {([
                                { id: "once", label: "Once" },
                                { id: "weekly", label: "Repeats weekly" },
                            ] as const).map((option) => (
                                <button
                                    key={option.id}
                                    type="button"
                                    onClick={() => setMode(option.id)}
                                    className={`min-h-10 cursor-pointer rounded-xl px-3 text-sm font-medium transition-colors ${
                                        mode === option.id
                                            ? "bg-lantern/15 text-lantern"
                                            : "text-twilight-text-soft hover:bg-white/[0.05]"
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        {mode === "weekly" && (
                            <WeekdayPicker value={weekdays} onChange={setWeekdays} />
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Start</span>
                                <TimePicker
                                    value={startTime}
                                    onChange={setStartTime}
                                    icon={<Clock3 size={14} className="text-moonlit" />}
                                />
                            </label>

                            <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">End</span>
                                <TimePicker
                                    value={endTime}
                                    onChange={setEndTime}
                                    icon={<Clock3 size={14} className="text-moonlit" />}
                                />
                            </label>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <label className="space-y-1.5">
                                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">From</span>
                                <div className="cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(event) => {
                                            setStartDate(event.target.value);
                                            if (mode === "weekly") {
                                                setWeekdays([toWeekdayCode(event.target.value)]);
                                            }
                                        }}
                                        className="w-full cursor-pointer bg-transparent text-sm text-twilight-text outline-none [color-scheme:dark]"
                                    />
                                </div>
                            </label>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Until</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setHasEndDate((value) => !value);
                                            if (hasEndDate) {
                                                setEndDate("");
                                            } else {
                                                setEndDate(startDate);
                                            }
                                        }}
                                        className={`cursor-pointer text-[11px] font-medium transition-colors ${hasEndDate ? "text-lantern" : "text-twilight-text-muted hover:text-twilight-text-soft"}`}
                                    >
                                        {hasEndDate ? "Remove" : "Add end date"}
                                    </button>
                                </div>
                                <div className="cursor-pointer rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5">
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(event) => setEndDate(event.target.value)}
                                        disabled={!hasEndDate}
                                        className="w-full cursor-pointer bg-transparent text-sm text-twilight-text outline-none disabled:cursor-not-allowed disabled:opacity-30 [color-scheme:dark]"
                                    />
                                </div>
                            </div>
                        </div>

                        <details className="group rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
                            <summary className="cursor-pointer list-none text-sm text-twilight-text-soft transition-colors group-open:text-twilight-text">
                                More options
                            </summary>
                            <div className="mt-3 space-y-3 border-t border-white/[0.04] pt-3">
                                <label className="block">
                                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Notes</span>
                                    <textarea
                                        value={notes}
                                        onChange={(event) => setNotes(event.target.value)}
                                        rows={2}
                                        className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-twilight-text outline-none placeholder:text-twilight-text-muted/60"
                                        placeholder="Room, professor, context\u2026"
                                    />
                                </label>

                                <div>
                                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Priority</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {([
                                            { value: 0, label: "None" },
                                            { value: 1, label: "P1" },
                                            { value: 2, label: "P2" },
                                            { value: 3, label: "P3" },
                                            { value: 4, label: "P4" },
                                        ] as const).map((item) => (
                                            <button
                                                key={item.value}
                                                type="button"
                                                onClick={() => setPriority(item.value as TaskPriority)}
                                                className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                    priority === item.value
                                                        ? "border-lantern/30 bg-lantern/15 text-lantern"
                                                        : "border-white/[0.06] text-twilight-text-soft hover:bg-white/[0.05]"
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-twilight-text-muted">Effort</span>
                                    <div className="flex gap-1.5">
                                        {([
                                            { value: 1, label: "Low" },
                                            { value: 2, label: "Medium" },
                                            { value: 3, label: "High" },
                                        ] as const).map((item) => (
                                            <button
                                                key={item.value}
                                                type="button"
                                                onClick={() => setEffort(effort === item.value ? null : item.value)}
                                                className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                                                    effort === item.value
                                                        ? "border-lantern/30 bg-lantern/15 text-lantern"
                                                        : "border-white/[0.06] text-twilight-text-soft hover:bg-white/[0.05]"
                                                }`}
                                            >
                                                {item.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </details>
                    </div>
                </div>

                {/* ── Fixed footer ── */}
                <div className={`border-t border-white/[0.06] ${shell.isPhone ? "px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3" : "px-6 pb-5 pt-3"}`}>
                    {mode === "weekly" && summary?.label && (
                        <p className="mb-3 flex items-center gap-2 text-xs text-twilight-text-muted">
                            <Repeat size={12} className="shrink-0 text-lantern" />
                            <span>{summary.label}</span>
                        </p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={requestClose}
                            className="min-h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-twilight-text-soft transition-colors hover:bg-white/[0.05]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!title.trim() || isPending}
                            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-lantern/30 bg-lantern/15 px-5 text-sm font-medium text-lantern transition-colors hover:bg-lantern/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <CalendarRange size={14} />
                            {isPending ? "Saving\u2026" : mode === "weekly" ? "Create series" : "Add to schedule"}
                        </button>
                    </div>
                </div>
            </motion.section>
        </div>,
        document.body,
    );
}
