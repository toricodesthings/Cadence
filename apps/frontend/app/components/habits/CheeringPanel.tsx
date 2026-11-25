import { useMemo, type CSSProperties } from "react";
import { Check, HandHeart } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { useSettings } from "../../hooks/core/use-settings";
import { useHabitsRange } from "../../hooks/habits/use-habits";
import { useRoutinePeople } from "../../hooks/sharing/use-share-routine";
import {
    formatMonthYear,
    fromTimeValue,
    getDaysInMonth,
    getFirstDayOfWeek,
    getMonthDateRange,
    isoDay,
    weekdayLabels,
    WEEK_START_INDEX,
} from "../../lib/utils/date-format";
import { routineTone } from "../../lib/utils/habits";
import { getTaskRecurrenceSummary } from "../../lib/utils/task/task-scheduling";
import { useToday } from "../../lib/utils/user-zone";
import { DetailPanelLayout } from "../shared/DetailPanelLayout";
import { CARD } from "../shared/DetailPanelSections";
import { ProfileFace } from "../sharing/PersonAvatar";
import { RoutineMark } from "./RoutineMark";

/**
 * A routine someone is cheering on (R7): what it is, whose it is, and this month's done days. The server sends only
 * done days and zeroed streaks to a supporter, so nothing here can show a miss, a skip or a run.
 */
export function CheeringPanel({
    habit,
    onClose,
    detailMode = "peek",
    onDetailModeChange,
}: {
    habit: Habit;
    onClose: () => void;
    detailMode?: "peek" | "focus";
    onDetailModeChange?: (mode: "peek" | "focus") => void;
}) {
    const today = useToday();
    const { data: settings } = useSettings();
    const weekStartsOn = WEEK_START_INDEX[settings?.dateTime?.weekStart ?? "Sunday"];
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7)) - 1;
    const { data: monthHabits } = useHabitsRange({ ...getMonthDateRange(year, month), archived: false });
    const logs = (monthHabits?.find((h) => h.id === habit.id) ?? habit).logs ?? [];
    const done = useMemo(() => new Set(logs.filter((l) => l.status === "COMPLETED").map((l) => l.targetDate)), [logs]);
    const cells = useMemo(() => {
        const days: Array<string | null> = [
            ...Array(getFirstDayOfWeek(year, month, weekStartsOn)).fill(null),
            ...Array.from({ length: getDaysInMonth(year, month) }, (_, i) => isoDay(year, month, i + 1)),
        ];
        while (days.length % 7) days.push(null);
        return days;
    }, [year, month, weekStartsOn]);
    const { data: people } = useRoutinePeople(habit);
    const owner = people?.find((p) => p.role === "owner");
    const schedule =
        getTaskRecurrenceSummary({
            recurrenceRule: habit.recurrenceRule,
            scheduledStart: habit.targetTime ? fromTimeValue(today, habit.targetTime) : null,
            scheduledEnd: null,
        })?.label ?? "Repeats";
    const doneThisMonth = cells.filter((iso) => iso && done.has(iso)).length;

    return (
        <div
            role="complementary"
            aria-label="Routine details"
            className="h-full min-w-0 overflow-hidden"
            style={{ "--routine-tone": routineTone(habit.colorAccent) } as CSSProperties}
        >
            <DetailPanelLayout
                leading={<HandHeart size={20} className="text-[var(--routine-tone)]" aria-hidden="true" />}
                title="Cheering on"
                closeLabel="Close routine details"
                onClose={onClose}
                mode={detailMode}
                onModeChange={onDetailModeChange}
            >
                <div className={`${CARD} flex items-center gap-3 px-4 py-3`}>
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl surface-control text-[var(--routine-tone)]">
                        <RoutineMark emoji={habit.emoji} size={24} />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate font-display text-lg font-semibold text-twilight-text">
                            {habit.title}
                        </h2>
                        <p className="text-xs text-twilight-text-muted">{schedule}</p>
                    </div>
                </div>

                <section className={`${CARD} space-y-3 px-4 py-3`} aria-label="Done this month">
                    <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-[13px] font-semibold text-twilight-text">
                            {formatMonthYear(cells.find(Boolean)!)}
                        </h3>
                        <p className="text-xs text-twilight-text-soft">
                            {doneThisMonth === 1 ? "Done 1 day" : `Done ${doneThisMonth} days`}
                        </p>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                        {weekdayLabels(2, weekStartsOn).map((label) => (
                            <span
                                key={label}
                                className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-twilight-text-muted"
                            >
                                {label}
                            </span>
                        ))}
                        {cells.map((iso, i) =>
                            iso ? (
                                <span
                                    key={iso}
                                    aria-label={`${iso}${done.has(iso) ? ": done" : ""}`}
                                    className={`grid aspect-square place-items-center rounded-full text-[11px] tabular-nums ${
                                        done.has(iso)
                                            ? "bg-[color-mix(in_srgb,var(--routine-tone)_22%,transparent)] text-[var(--routine-tone)]"
                                            : iso === today
                                              ? "text-twilight-text ring-1 ring-twilight-border"
                                              : "text-twilight-text-muted"
                                    }`}
                                >
                                    {done.has(iso) ? <Check size={12} aria-hidden="true" /> : Number(iso.slice(8))}
                                </span>
                            ) : (
                                <span key={`pad-${i}`} />
                            ),
                        )}
                    </div>
                </section>

                {owner ? (
                    <div className="flex shrink-0 items-center gap-2 px-1 text-xs text-twilight-text-soft">
                        <ProfileFace person={owner} userId={owner.userId} showRole={false} />
                        <span>Cheering {owner.name ?? "them"} on</span>
                    </div>
                ) : null}
            </DetailPanelLayout>
        </div>
    );
}
