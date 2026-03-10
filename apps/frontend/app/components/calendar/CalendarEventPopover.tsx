import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Clock, Flag, Gauge, CalendarRange, CalendarClock, CalendarDays } from "lucide-react";
import { motion } from "framer-motion";
import { useCreateTask } from "../../hooks/tasks";
import { addDays, parseLocalDate, toISODate } from "../../lib/utils/date-format";
import { PriorityPicker } from "../tasks/PriorityPicker";
import * as Popover from "../primitives/Popover";
import * as ScrollArea from "../primitives/ScrollArea";
import type { TaskPriority, EffortLevel } from "../../types/task";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CalendarEventInfo {
    /** ISO date string "YYYY-MM-DD" */
    date: string;
    /** Starting hour (0-23) */
    startHour: number;
    /** Starting minute (0 or 30) */
    startMinute: number;
    /** Whether this is an all-day task (from month view / toolbar) */
    isAllDay?: boolean;
    /** Viewport X for positioning */
    anchorX: number;
    /** Viewport Y for positioning */
    anchorY: number;
}

interface CalendarEventPopoverProps {
    info: CalendarEventInfo;
    onClose: () => void;
}

type CalendarCreateMode = "deadline" | "duration" | "timed";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimeLabel(hour: number, minute: number): string {
    const period = hour >= 12 ? "PM" : "AM";
    const h = hour % 12 || 12;
    const m = String(minute).padStart(2, "0");
    return `${h}:${m} ${period}`;
}

type TimeOption = { hour: number; minute: number; value: string; label: string };

const TIME_OPTIONS: TimeOption[] = Array.from({ length: 48 }, (_, i) => {
    const hour = Math.floor(i / 2);
    const minute = (i % 2) * 30;
    return {
        hour,
        minute,
        value: `${hour}:${minute}`,
        label: formatTimeLabel(hour, minute)
    };
});

function TimePickerDropdown({
    value,
    onChange
}: {
    value: string;
    onChange: (hour: number, minute: number) => void
}) {
    const [open, setOpen] = useState(false);
    const selectedLabel = TIME_OPTIONS.find(o => o.value === value)?.label || "Select time";
    const scrollRef = useRef<HTMLDivElement>(null);

    // Scroll to selected option when opened
    useEffect(() => {
        if (open && scrollRef.current) {
            const selectedEl = scrollRef.current.querySelector('[data-selected="true"]');
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'center' });
            }
        }
    }, [open]);

    return (
        <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className="bg-white/[0.04] rounded-lg px-2 py-1 text-[13px] text-twilight-text-soft border border-white/[0.06] outline-none cursor-pointer hover:bg-white/[0.08] transition-colors focus-visible:ring-1 focus-visible:ring-lantern"
                >
                    {selectedLabel}
                </button>
            </Popover.Trigger>
            <Popover.Content
                align="center"
                sideOffset={4}
                className="z-[110] p-1 w-28 glass-panel border border-twilight-border shadow-2xl rounded-xl animate-in fade-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
            >
                <ScrollArea.Root className="h-[180px] w-full" type="auto">
                    <ScrollArea.Viewport className="w-full h-full rounded-[inherit]" ref={scrollRef}>
                        <div className="flex flex-col gap-0.5">
                            {TIME_OPTIONS.map((opt) => {
                                const isSelected = opt.value === value;
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        data-selected={isSelected}
                                        onClick={() => {
                                            onChange(opt.hour, opt.minute);
                                            setOpen(false);
                                        }}
                                        className={`
                                            w-full text-left px-2.5 py-1.5 rounded-xl text-[13px] transition-colors cursor-pointer
                                            ${isSelected
                                                ? "bg-lantern/20 text-lantern font-medium"
                                                : "text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text"
                                            }
                                        `}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollArea.Viewport>
                    <ScrollArea.Scrollbar className="flex select-none touch-none p-0.5 bg-transparent transition-colors duration-[160ms] ease-out hover:bg-white/[0.02] data-[orientation=vertical]:w-2 data-[orientation=horizontal]:flex-col data-[orientation=horizontal]:h-2" orientation="vertical">
                        <ScrollArea.Thumb className="flex-1 bg-white/10 rounded-[10px] relative before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-full before:h-full before:min-w-[44px] before:min-h-[44px]" />
                    </ScrollArea.Scrollbar>
                </ScrollArea.Root>
            </Popover.Content>
        </Popover.Root>
    );
}

// ── Component ──────────────────────────────────────────────────────────────

export function CalendarEventPopover({ info, onClose }: CalendarEventPopoverProps) {
    const [title, setTitle] = useState("");
    const [startHour, setStartHour] = useState(info.startHour);
    const [startMinute, setStartMinute] = useState(info.startMinute);
    const [endHour, setEndHour] = useState(Math.min(23, info.startHour + 1));
    const [endMinute, setEndMinute] = useState(info.startMinute);
    const [durationDays, setDurationDays] = useState(2);
    const [createMode, setCreateMode] = useState<CalendarCreateMode>(info.isAllDay ? "deadline" : "timed");
    const [priority, setPriority] = useState<TaskPriority>(0);
    const [effort, setEffort] = useState<EffortLevel | null>(null);
    const titleRef = useRef<HTMLInputElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const { mutate: createTask, isPending } = useCreateTask();

    // Auto-focus title on mount
    useEffect(() => {
        const id = requestAnimationFrame(() => titleRef.current?.focus());
        return () => cancelAnimationFrame(id);
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    // Close on click outside (with small delay to avoid the triggering click)
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const timer = setTimeout(() => document.addEventListener("mousedown", handler), 100);
        return () => {
            clearTimeout(timer);
            document.removeEventListener("mousedown", handler);
        };
    }, [onClose]);

    const handleSubmit = useCallback(() => {
        if (!title.trim()) return;
        const [y, m, d] = info.date.split("-").map(Number);

        const onSuccess = () => onClose();

        if (createMode === "deadline") {
            createTask({
                title: title.trim(),
                orderIndex: Date.now(),
                dueDate: info.date,
                isAllDay: true,
                ...(priority > 0 && { priority }),
                ...(effort !== null && { effort }),
            }, { onSuccess });
        } else if (createMode === "duration") {
            const endDate = toISODate(addDays(parseLocalDate(info.date), Math.max(1, durationDays) - 1));
            createTask({
                title: title.trim(),
                orderIndex: Date.now(),
                dueDate: info.date,
                scheduledEnd: endDate,
                isAllDay: true,
                ...(priority > 0 && { priority }),
                ...(effort !== null && { effort }),
            }, { onSuccess });
        } else {
            const startDate = new Date(y, m - 1, d, startHour, startMinute, 0, 0);
            const endDate = new Date(y, m - 1, d, endHour, endMinute, 0, 0);
            if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);

            createTask({
                title: title.trim(),
                orderIndex: Date.now(),
                scheduledStart: startDate.toISOString(),
                scheduledEnd: endDate.toISOString(),
                dueDate: info.date,
                isAllDay: false,
                ...(priority > 0 && { priority }),
                ...(effort !== null && { effort }),
            }, { onSuccess });
        }
    }, [title, info, startHour, startMinute, endHour, endMinute, priority, effort, createTask, onClose]);

    // ── Position in viewport ───────────────────────────────────────────────
    const popoverW = 340;
    const popoverH = 320;
    const pad = 16;

    let x = info.anchorX + 12;
    let y = info.anchorY - 60;

    if (typeof window !== "undefined") {
        if (x + popoverW + pad > window.innerWidth) x = info.anchorX - popoverW - 12;
        if (x < pad) x = pad;
        if (y + popoverH + pad > window.innerHeight) y = window.innerHeight - popoverH - pad;
        if (y < pad) y = pad;
    }

    const dateLabel = parseLocalDate(info.date).toLocaleDateString("en-US", {
        weekday: "short", month: "short", day: "numeric",
    });
    const durationEndLabel = toISODate(addDays(parseLocalDate(info.date), Math.max(1, durationDays) - 1));

    return createPortal(
        <motion.div
            ref={popoverRef}
            data-focus-container
            initial={{ opacity: 0, scale: 0.95, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed z-[100] glass-surface rounded-2xl shadow-2xl border border-twilight-border"
            style={{ left: x, top: y, width: popoverW }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <span className="text-[13px] font-display font-medium text-twilight-text-soft">
                    {dateLabel}
                </span>
                <button
                    type="button"
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-white/[0.06] transition-colors cursor-pointer"
                    aria-label="Close"
                >
                    <X size={15} className="text-twilight-text-muted" />
                </button>
            </div>

            {/* ── Title input ── */}
            <div className="px-5 pb-4">
                <input
                    ref={titleRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full bg-transparent text-lg text-twilight-text outline-none placeholder:text-twilight-text-muted/80 font-medium"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                        }
                    }}
                />
            </div>

            {/* ── Date & Time row ── */}
            <div className="px-5 pb-3">
                <div className="flex items-center gap-1 rounded-2xl border border-twilight-border bg-white/[0.03] p-1">
                    {[
                        { id: "deadline", label: "Deadline", icon: CalendarDays },
                        { id: "duration", label: "Duration", icon: CalendarRange },
                        { id: "timed", label: "Time block", icon: CalendarClock },
                    ].map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setCreateMode(id as CalendarCreateMode)}
                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-medium transition-colors ${createMode === id
                                ? "bg-lantern/15 text-lantern"
                                : "text-twilight-text-muted hover:text-twilight-text"
                                }`}
                        >
                            <Icon size={13} aria-hidden="true" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-5 pb-3 flex items-center gap-3">
                <Clock size={15} className="text-twilight-text-muted shrink-0" />
                <div className="flex items-center gap-2 text-[13px] text-twilight-text-soft">
                    <span className="font-medium">{dateLabel}</span>
                    {createMode === "duration" && (
                        <>
                            <span className="text-twilight-text-muted">·</span>
                            <span>{durationEndLabel}</span>
                            <span className="text-twilight-text-muted">·</span>
                            <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.04] px-2 py-1">
                                <button
                                    type="button"
                                    onClick={() => setDurationDays((days) => Math.max(2, days - 1))}
                                    className="text-twilight-text-muted hover:text-twilight-text"
                                    aria-label="Shorten duration"
                                >
                                    -
                                </button>
                                <span className="min-w-10 text-center">{durationDays}d</span>
                                <button
                                    type="button"
                                    onClick={() => setDurationDays((days) => Math.min(14, days + 1))}
                                    className="text-twilight-text-muted hover:text-twilight-text"
                                    aria-label="Extend duration"
                                >
                                    +
                                </button>
                            </div>
                        </>
                    )}
                    {createMode === "timed" && (
                        <>
                            <span className="text-twilight-text-muted">·</span>
                            <TimePickerDropdown
                                value={`${startHour}:${startMinute}`}
                                onChange={(h, m) => {
                                    setStartHour(h);
                                    setStartMinute(m);
                                    setEndHour(Math.min(23, h + 1));
                                    setEndMinute(m);
                                }}
                            />
                            <span className="text-twilight-text-muted">–</span>
                            <TimePickerDropdown
                                value={`${endHour}:${endMinute}`}
                                onChange={(h, m) => {
                                    setEndHour(h);
                                    setEndMinute(m);
                                }}
                            />
                        </>
                    )}
                </div>
            </div>

            {/* ── Priority ── */}
            <div className="px-5 pb-3 flex items-center gap-3">
                <Flag size={15} className="text-twilight-text-muted shrink-0" />
                <div className="flex items-center gap-1">
                    <PriorityPicker currentPriority={priority} onSelect={setPriority} compact />
                </div>
            </div>

            {/* ── Effort ── */}
            <div className="px-5 pb-4 flex items-center gap-3">
                <Gauge size={15} className="text-twilight-text-muted shrink-0" />
                <div className="flex bg-white/[0.04] p-0.5 rounded-xl gap-0.5 w-[200px]">
                    {([1, 2, 3] as const).map((level) => (
                        <button
                            key={level}
                            type="button"
                            onClick={() => setEffort(effort === level ? null : level)}
                            className={`flex-1 px-2 py-1.5 rounded-[10px] text-[12px] font-medium transition-colors
                                ${effort === level
                                    ? "bg-lantern/15 text-lantern"
                                    : "text-twilight-text-muted hover:text-twilight-text"
                                }`}
                        >
                            {level === 1 ? "Low" : level === 2 ? "Med" : "High"}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Footer ── */}
            <div className="px-5 py-3.5 border-t border-twilight-border/50 bg-white/[0.02] flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-2 rounded-xl text-[13px] font-medium text-twilight-text-muted hover:text-twilight-text-soft hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!title.trim() || isPending}
                    className={`
                        flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-medium transition-colors duration-200 cursor-pointer
                        bg-lantern/20 text-lantern border border-lantern/25
                        hover:bg-lantern/30 hover:border-lantern/35
                        disabled:opacity-40 disabled:cursor-not-allowed
                    `}
                >
                    {isPending ? "Adding\u2026" : "Add Task"}
                    {!isPending && (
                        <span className="text-[10px] text-lantern/50 font-normal">&#9166;</span>
                    )}
                </button>
            </div>
        </motion.div>,
        document.body,
    );
}
