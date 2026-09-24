import { Button } from "../primitives/Button";
import { CalendarDays } from "lucide-react";
import { DatePicker } from "../shared/DatePicker";
import { placementLabel } from "../../lib/utils/date-format";
import { todayISO, tomorrowISO } from "../../hooks/inbox/use-process-inbox-to-task";

/** Pill treatment shared with task signals: rounded, hairline border, 36px tall. */
export const DAY_PILL =
    "min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-medium active:scale-100";
export const DAY_PILL_SUGGESTED =
    "border-accent-primary/25 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/15";
export const DAY_PILL_PLAIN =
    "border-white/[0.07] bg-white/[0.03] text-twilight-text-soft hover:bg-white/[0.06] hover:text-twilight-text";

/** The same placement vocabulary for thoughts, tasks, details and bulk actions. */
export function CaptureDayChips({
    detected,
    lightest,
    onPlace,
    onPick,
    disabled,
}: {
    detected?: string | null;
    lightest: string;
    onPlace: (date: string) => void;
    onPick?: () => void;
    disabled?: boolean;
}) {
    const days = [...new Set([detected, todayISO(), tomorrowISO(), lightest].filter((d): d is string => Boolean(d)))];
    const suggested = detected || lightest;
    const pickDayButton = (
        <Button
            variant="ghost"
            size="none"
            type="button"
            disabled={disabled}
            onClick={onPick}
            className={`${DAY_PILL} ${DAY_PILL_PLAIN} gap-1.5`}
        >
            <CalendarDays size={12} aria-hidden />
            Pick day…
        </Button>
    );
    return (
        <div className="flex min-w-0 flex-wrap gap-2">
            {days.map((day) => (
                <Button
                    variant="ghost"
                    size="none"
                    type="button"
                    key={day}
                    disabled={disabled}
                    onClick={() => onPlace(day)}
                    className={`${DAY_PILL} ${day === suggested ? DAY_PILL_SUGGESTED : DAY_PILL_PLAIN}`}
                >
                    {placementLabel(day)}
                </Button>
            ))}
            {onPick ? (
                pickDayButton
            ) : (
                <DatePicker
                    className="shrink-0"
                    label="Pick day"
                    value={null}
                    onChange={(day) => {
                        if (day) onPlace(day);
                    }}
                    disabled={disabled}
                >
                    {pickDayButton}
                </DatePicker>
            )}
        </div>
    );
}
