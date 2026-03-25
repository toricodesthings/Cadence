import { useEffect, useMemo, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { CalendarGrid } from "../calendar/CalendarGrid";
import * as Popover from "../primitives/Popover";
import { getDateFormatConfig, parseLocalDate, toISODate } from "../../lib/utils/date-format";

const EMPTY_DAY_SET = new Set<number>();

function formatDateLabel(date: string) {
    const config = getDateFormatConfig();
    const d = parseLocalDate(date);
    if (config.dateStyle === "dmy") {
        return d.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
        });
    }
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function EventDatePicker({
    value,
    onChange,
    compact = false,
}: {
    value: string;
    onChange: (value: string) => void;
    compact?: boolean;
}) {
    const selectedDate = useMemo(() => parseLocalDate(value), [value]);
    const [viewDate, setViewDate] = useState(selectedDate);
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const startYear = Math.min(selectedDate.getFullYear(), currentYear) - 80;
        const endYear = Math.max(selectedDate.getFullYear(), currentYear) + 20;

        return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
    }, [selectedDate]);

    useEffect(() => {
        setViewDate(selectedDate);
    }, [selectedDate]);

    const handleMonthChange = (delta: number) => {
        setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
    };

    const handleYearChange = (delta: number) => {
        setViewDate((current) => new Date(current.getFullYear() + delta, current.getMonth(), 1));
    };

    const handleYearSelect = (year: number) => {
        setViewDate((current) => new Date(year, current.getMonth(), 1));
    };

    const handleSelectDate = (day: number) => {
        const next = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        onChange(toISODate(next));
    };

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className={`flex w-full cursor-pointer items-center justify-between text-left transition-colors hover:border-white/[0.10] hover:bg-white/[0.05] ${
                        compact
                            ? "rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5"
                            : "rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3"
                    }`}
                    aria-label="Choose event date"
                >
                    <span className="flex items-center gap-3">
                        <span className={`flex items-center justify-center bg-white/[0.04] text-moonlit ${compact ? "h-8 w-8 rounded-lg" : "h-9 w-9 rounded-xl"}`}>
                            <Calendar size={16} aria-hidden="true" />
                        </span>
                        <span className="text-sm font-medium text-twilight-text">{formatDateLabel(value)}</span>
                    </span>
                </button>
            </Popover.Trigger>
            <Popover.Content
                side="bottom"
                align="start"
                className="layer-system-dialog z-[120] w-[20rem] overflow-hidden rounded-[24px] p-0"
            >
                <div className="border-b border-twilight-border/40 px-3 py-2.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] font-semibold text-twilight-text">
                                {viewDate.toLocaleString("default", { month: "long" })}
                            </span>
                            <label className="sr-only" htmlFor="event-date-picker-year">Choose year</label>
                            <select
                                id="event-date-picker-year"
                                value={String(viewDate.getFullYear())}
                                onChange={(event) => handleYearSelect(Number.parseInt(event.target.value, 10))}
                                className="min-h-8 cursor-pointer rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 text-[12px] font-semibold text-twilight-text outline-none transition-colors hover:bg-white/[0.06] focus:border-moonlit/40"
                            >
                                {yearOptions.map((year) => (
                                    <option key={year} value={year}>
                                        {year}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => handleYearChange(-1)}
                                aria-label="Previous year"
                                className="rounded-lg p-1.5 text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                            >
                                <ChevronsLeft size={15} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleMonthChange(-1)}
                                aria-label="Previous month"
                                className="rounded-lg p-1.5 text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                            >
                                <ChevronLeft size={15} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleMonthChange(1)}
                                aria-label="Next month"
                                className="rounded-lg p-1.5 text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                            >
                                <ChevronRight size={15} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleYearChange(1)}
                                aria-label="Next year"
                                className="rounded-lg p-1.5 text-twilight-text-muted hover:bg-white/[0.06] hover:text-twilight-text"
                            >
                                <ChevronsRight size={15} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-3 pb-3 pt-2">
                    <CalendarGrid
                        year={viewDate.getFullYear()}
                        month={viewDate.getMonth()}
                        selectedDate={value}
                        datesWithTasks={EMPTY_DAY_SET}
                        onSelectDate={handleSelectDate}
                        variant="compact"
                    />
                </div>
            </Popover.Content>
        </Popover.Root>
    );
}
