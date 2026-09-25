import { HABIT_WEEKDAYS } from "@cadence/contracts/habit";
import { TimePicker } from "../primitives/TimePicker";
import { formatTime, fromTimeValue, toISODate } from "../../lib/utils/date-format";

const DAY_LABELS: Record<(typeof HABIT_WEEKDAYS)[number], string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

/** Per-weekday times: empty = the usual time, "Any time" = no time that day. */
export function DayTimes({ value, usualTime, onChange }: {
    value: Record<string, string> | null | undefined;
    usualTime: string | null;
    onChange: (targetTimes: Record<string, string> | null) => void;
}) {
    const times = value ?? {};
    const set = (day: string, next: string | undefined) => {
        const updated = { ...times };
        if (next === undefined) delete updated[day];
        else updated[day] = next;
        onChange(Object.keys(updated).length ? updated : null);
    };
    return (
        <div className="space-y-1.5" role="group" aria-label="Times by day">
            {HABIT_WEEKDAYS.map((day) => {
                const override = times[day];
                const anyTime = override === "";
                return (
                    <div key={day} className="flex items-center gap-2">
                        <span className="w-9 shrink-0 text-xs text-twilight-text-muted">{DAY_LABELS[day]}</span>
                        <TimePicker
                            label={`${DAY_LABELS[day]} time`}
                            value={override || ""}
                            placeholder={usualTime ? formatTime(fromTimeValue(toISODate(new Date()), usualTime)) : undefined}
                            disabled={anyTime}
                            clearable
                            onChange={(next) => set(day, next || undefined)}
                            className="min-w-0 flex-1"
                        />
                        <button
                            type="button"
                            aria-pressed={anyTime}
                            onClick={() => set(day, anyTime ? undefined : "")}
                            className={`min-h-10 shrink-0 cursor-pointer rounded-xl border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 ${anyTime ? "border-accent-primary/30 bg-accent-primary/15 text-accent-primary" : "border-white/[0.06] bg-white/[0.02] text-twilight-text-soft hover:bg-white/[0.05]"}`}
                        >
                            Any time
                        </button>
                    </div>
                );
            })}
            <p className="text-xs text-twilight-text-muted">Empty days use the usual time.</p>
        </div>
    );
}
