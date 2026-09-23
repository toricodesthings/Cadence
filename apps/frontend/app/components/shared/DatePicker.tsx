import * as React from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import * as Popover from "../primitives/Popover";
import { CalendarGrid } from "../calendar/CalendarGrid";
import { useIsCoarsePointer } from "../../hooks/ui/use-coarse-pointer";
import { formatShortDateLabel, parseLocalDate, toISODate } from "../../lib/utils/date-format";
import { COMPOSER_FIELD } from "./Composer";

const NAV_BTN = "touch-target flex cursor-pointer items-center justify-center rounded-lg text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
const NO_MARKS = new Set<number>();

/**
 * Month header (label + prev/next, optional year select) over the compact
 * `CalendarGrid`. The one calendar body behind every date choice: `DatePicker`
 * and the task schedule surface both render it.
 */
export function MonthCalendar({ viewDate, onViewDateChange, selectedDate, onSelectDate, marked = NO_MARKS, yearNav = false }: {
    viewDate: Date;
    onViewDateChange: (date: Date) => void;
    /** "YYYY-MM-DD", or "" for none. */
    selectedDate: string;
    onSelectDate: (date: string) => void;
    /** Day numbers in the viewed month that carry a dot. */
    marked?: Set<number>;
    /** A year select, for far-off dates like birthdays. */
    yearNav?: boolean;
}) {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const go = (months: number) => onViewDateChange(new Date(year, month + months, 1));
    const yearOptions = React.useMemo(() => {
        const now = new Date().getFullYear();
        const start = Math.min(year, now) - 100;
        return Array.from({ length: Math.max(year, now) + 20 - start + 1 }, (_, i) => start + i);
    }, [year]);

    return (
        <div>
            <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
                {yearNav ? (
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[12px] font-semibold text-twilight-text">{viewDate.toLocaleString("default", { month: "long" })}</span>
                        <select
                            aria-label="Year"
                            value={year}
                            onChange={(e) => onViewDateChange(new Date(Number(e.target.value), month, 1))}
                            className="min-h-8 cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-[12px] font-semibold text-twilight-text transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </span>
                ) : (
                    <span className="text-[12px] font-semibold text-twilight-text">{viewDate.toLocaleString("default", { month: "long", year: "numeric" })}</span>
                )}
                <div className="flex shrink-0 items-center">
                    <button type="button" onClick={() => go(-1)} aria-label="Previous month" className={NAV_BTN}><ChevronLeft size={15} aria-hidden="true" /></button>
                    <button type="button" onClick={() => go(1)} aria-label="Next month" className={NAV_BTN}><ChevronRight size={15} aria-hidden="true" /></button>
                </div>
            </div>
            <div className="px-3 pb-3">
                <CalendarGrid
                    year={year}
                    month={month}
                    selectedDate={selectedDate}
                    datesWithTasks={marked}
                    onSelectDate={(day) => onSelectDate(toISODate(new Date(year, month, day)))}
                    variant="compact"
                />
            </div>
        </div>
    );
}

interface DatePickerProps {
    /** "YYYY-MM-DD"; null or "" when unset. */
    value: string | null;
    onChange: (date: string | null) => void;
    /** Accessible name, e.g. "Series end date". */
    label: string;
    /** Allows clearing (a quiet footer action on desktop; the OS clear control on touch). */
    clearLabel?: string;
    /** A year select, for far-off dates like birthdays. */
    yearNav?: boolean;
    disabled?: boolean;
    /** Default trigger text when unset. */
    placeholder?: string;
    /** Classes for the default trigger, or the wrapper around a custom one. */
    className?: string;
    /** Custom trigger (a button). Defaults to a field-styled button. */
    children?: React.ReactElement;
}

/**
 * The app's single date picker. Touch devices get the platform's own picker
 * (iOS wheel, Android calendar); pointer devices get a `MonthCalendar` popover.
 */
export function DatePicker(props: DatePickerProps) {
    return useIsCoarsePointer() ? <NativeDateField {...props} /> : <DesktopDatePicker {...props} />;
}

function NativeDateField({ value, onChange, label, clearLabel, disabled, className, children }: DatePickerProps) {
    const input = (overlay: boolean) => (
        <input
            type="date"
            value={value ?? ""}
            disabled={disabled}
            aria-label={label}
            onChange={(e) => { if (e.target.value || clearLabel) onChange(e.target.value || null); }}
            className={overlay ? "absolute inset-0 cursor-pointer opacity-0" : `${COMPOSER_FIELD} min-h-11 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 ${className ?? ""}`}
        />
    );
    if (!children) return input(false);
    // The visible trigger stays; a transparent native input over it takes the tap.
    return <span className={`relative grid ${className ?? ""}`}>{React.cloneElement(children, { tabIndex: -1, "aria-hidden": true } as object)}{input(true)}</span>;
}

function DesktopDatePicker({ value, onChange, label, clearLabel, yearNav, disabled, placeholder = "Pick a date", className, children }: DatePickerProps) {
    const [open, setOpen] = React.useState(false);
    const [viewDate, setViewDate] = React.useState(() => (value ? parseLocalDate(value) : new Date()));

    const onOpenChange = (next: boolean) => {
        if (next) setViewDate(value ? parseLocalDate(value) : new Date());
        setOpen(next);
    };
    const pick = (date: string | null) => {
        onChange(date);
        setOpen(false);
    };

    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger asChild disabled={disabled}>
                {children ?? (
                    <button
                        type="button"
                        aria-label={label}
                        className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-left text-sm transition-colors hover:border-white/[0.10] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 disabled:cursor-not-allowed disabled:opacity-30 ${className ?? ""}`}
                    >
                        <Calendar size={15} className="shrink-0 text-moonlit" aria-hidden="true" />
                        <span className={value ? "font-medium text-twilight-text" : "text-twilight-text-muted"}>
                            {value ? formatShortDateLabel(value, { year: true }) : placeholder}
                        </span>
                    </button>
                )}
            </Popover.Trigger>
            <Popover.Content
                side="bottom"
                align="start"
                role="dialog"
                aria-label={label}
                className="w-[18rem] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overflow-x-hidden overscroll-contain p-0"
            >
                <MonthCalendar viewDate={viewDate} onViewDateChange={setViewDate} selectedDate={value ?? ""} onSelectDate={pick} yearNav={yearNav} />
                {clearLabel && value ? (
                    <div className="border-t border-twilight-border/40 px-3 py-2">
                        <button
                            type="button"
                            onClick={() => pick(null)}
                            className="min-h-10 w-full cursor-pointer rounded-xl px-3 text-center text-[13px] text-twilight-text-muted transition-colors hover:bg-white/[0.06] hover:text-twilight-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                        >
                            {clearLabel}
                        </button>
                    </div>
                ) : null}
            </Popover.Content>
        </Popover.Root>
    );
}
