import { Calendar } from "lucide-react";
import { formatDateSpan, formatShortDate, formatShortDateTime } from "../../lib/utils/date-format";
import { DeadlinePickerPopover } from "./DeadlinePickerPopover";
import type { ScheduleUpdates } from "./QuickScheduleSurface";

export const QUICK_CHIP =
    "inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50";
export const quickChipTone = (active: unknown) =>
    active
        ? "border-accent-primary/20 bg-accent-primary/10 text-accent-primary"
        : "border-twilight-border/35 bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.05]";

export function DeadlineTrigger({
    schedule,
    onChange,
    returnFocus,
    iconOnly = false,
    row = false,
}: {
    schedule: ScheduleUpdates;
    onChange: (updates: ScheduleUpdates) => void;
    returnFocus?: () => void;
    iconOnly?: boolean;
    row?: boolean;
}) {
    const set = Boolean(schedule.dueDate || schedule.scheduledStart);
    const label = schedule.scheduledStart
        ? formatShortDateTime(schedule.scheduledStart)
        : schedule.dueDate && schedule.endDate
          ? formatDateSpan(schedule.dueDate, schedule.endDate)
          : schedule.dueDate
            ? formatShortDate(schedule.dueDate)
            : row
              ? "None"
              : "Add date";
    return (
        <DeadlinePickerPopover
            dueDate={schedule.dueDate}
            endDate={schedule.endDate}
            scheduledStart={schedule.scheduledStart}
            scheduledEnd={schedule.scheduledEnd}
            recurrenceRule={schedule.recurrenceRule}
            onChange={onChange}
            returnFocus={returnFocus}
        >
            <button
                type="button"
                data-no-dnd="true"
                aria-label={set ? `Date: ${label}. Click to change` : "Add task date"}
                className={
                    row
                        ? `inline-flex min-h-10 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-full border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm transition-colors hover:border-white/[0.10] hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${set ? "font-medium text-twilight-text" : "text-twilight-text-muted"}`
                        : `${QUICK_CHIP} ${quickChipTone(set)}`
                }
            >
                {row ? null : <Calendar size={14} aria-hidden="true" />}
                {iconOnly ? null : label}
            </button>
        </DeadlinePickerPopover>
    );
}
