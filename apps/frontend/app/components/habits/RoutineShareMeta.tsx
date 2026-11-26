import { useState } from "react";
import { Check, HandHeart, Users } from "lucide-react";
import type { Habit } from "@cadence/contracts/habit";
import { useAuthState } from "../../hooks/auth/use-auth-state";
import { isSharedRoutine, useCheer, useRoutinePeople } from "../../hooks/sharing/use-share-routine";
import { AvatarFace, ProfileFace } from "../sharing/PersonAvatar";
import { RoutineMark } from "./RoutineMark";
import { Button } from "../primitives/Button";
import type { RoutineDay } from "./RoutineWeekRow";

export function RoutineShareMeta({ habit, today }: { habit: Habit; today: string }) {
    const { session } = useAuthState();
    const me = session?.user.id;
    const shared = isSharedRoutine(habit);
    const { data: people } = useRoutinePeople(shared ? habit : undefined);
    if (!shared) return null;

    const nameOf = (uid: string) => people?.find((p) => p.userId === uid)?.name ?? "Someone";
    const personOf = (uid: string) => people?.find((p) => p.userId === uid);

    const todayInfo = habit.today;
    const todayLog = habit.logs?.find((l) => l.targetDate === today);

    let turnText: string | null = null;
    if (habit.shareMode === "turns" && todayInfo?.turn) {
        const coveredBy = todayInfo.others[0]?.userId;
        if (coveredBy && coveredBy !== todayInfo.turn) {
            turnText = `Covered by ${nameOf(coveredBy)}`;
        } else if (todayLog?.status === "COMPLETED" && todayLog.userId && todayLog.userId !== todayInfo.turn) {
            turnText = todayLog.userId === me ? "Covered by you" : `Covered by ${nameOf(todayLog.userId)}`;
        } else if (todayInfo.turn === me) {
            turnText = "Your turn";
        } else {
            turnText = `${nameOf(todayInfo.turn)}'s turn`;
        }
    }

    const othersDone = habit.shareMode !== "turns" ? (todayInfo?.others ?? []) : [];
    const cheerSenders = todayInfo?.cheers ?? [];

    return (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-twilight-text-soft">
            <span className="inline-flex items-center gap-1" aria-label="Shared routine">
                <Users size={11} aria-hidden="true" />
                {turnText ?? null}
            </span>
            {othersDone.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                    {othersDone.slice(0, 3).map((o) => (
                        <AvatarFace key={o.userId} person={personOf(o.userId)} size={16} />
                    ))}
                    <span>
                        {othersDone.length === 1
                            ? `${nameOf(othersDone[0].userId)} did it`
                            : `${nameOf(othersDone[0].userId)} and ${othersDone.length - 1} other${othersDone.length > 2 ? "s" : ""} did it`}
                    </span>
                </span>
            ) : null}
            {cheerSenders.length > 0 ? (
                <span className="inline-flex items-center gap-1">
                    <HandHeart size={12} aria-hidden="true" />
                    <span>
                        {cheerSenders.length === 1
                            ? `${nameOf(cheerSenders[0])} is cheering you on`
                            : `${nameOf(cheerSenders[0])} and ${cheerSenders.length - 1} other${cheerSenders.length > 2 ? "s" : ""} are cheering you on`}
                    </span>
                </span>
            ) : null}
        </div>
    );
}

type CheeringSelect = { selectedHabitId: string | null; onSelectHabit: (id: string) => void };

function CheeringRow({
    habit,
    days,
    today,
    selected,
    onSelect,
}: {
    habit: Habit;
    days: RoutineDay[];
    today: string;
    selected: boolean;
    onSelect: () => void;
}) {
    const { data: people } = useRoutinePeople(habit);
    const cheer = useCheer();
    const [cheered, setCheered] = useState(false);
    const owner = people?.find((p) => p.role === "owner") ?? null;
    const doneDates = new Set((habit.logs ?? []).filter((l) => l.status === "COMPLETED").map((l) => l.targetDate));

    return (
        <li
            data-selected={selected || undefined}
            className="flex flex-wrap items-center gap-3 rounded-2xl surface-row px-3 py-2.5 data-[selected]:ring-1 data-[selected]:ring-accent-primary/40"
        >
            <button
                type="button"
                onClick={onSelect}
                aria-pressed={selected}
                aria-label={`${habit.title}, details`}
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
            >
                <RoutineMark emoji={habit.emoji} size={18} />
                <span className="truncate text-sm font-medium text-twilight-text">{habit.title}</span>
            </button>
            {owner ? <ProfileFace person={owner} userId={owner.userId} showRole={false} /> : null}
            <div className="flex items-center gap-1.5" aria-label={`Days completed this week for ${habit.title}`}>
                {days.map((day) => {
                    const done = doneDates.has(day.iso);
                    return (
                        <span
                            key={day.iso}
                            aria-label={`${day.short}: ${done ? "done" : "open"}`}
                            className={`grid size-6 place-items-center rounded-full text-[11px] ${
                                done
                                    ? "bg-accent-primary/20 text-accent-primary"
                                    : "border border-twilight-border/50 bg-transparent text-twilight-text-muted/40"
                            }`}
                        >
                            {done ? <Check size={12} aria-hidden="true" /> : null}
                        </span>
                    );
                })}
            </div>
            <Button
                variant="secondary"
                size="sm"
                disabled={cheered || cheer.isPending}
                onClick={() => {
                    setCheered(true);
                    cheer.mutate(
                        { habitId: habit.id, title: habit.title, targetDate: today },
                        { onError: () => setCheered(false) },
                    );
                }}
            >
                <HandHeart size={14} aria-hidden="true" />
                {cheered ? "Cheered" : "Cheer"}
            </Button>
        </li>
    );
}

export function CheeringOnSection({
    habits,
    days,
    today,
    selectedHabitId,
    onSelectHabit,
}: CheeringSelect & { habits: Habit[]; days: RoutineDay[]; today: string }) {
    if (habits.length === 0) return null;
    return (
        <section aria-label="Cheering on" className="mt-6 space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-[0.14em] text-twilight-text-soft">
                Cheering on
            </h2>
            <ul className="flex flex-col gap-2">
                {habits.map((habit) => (
                    <CheeringRow
                        key={habit.id}
                        habit={habit}
                        days={days}
                        today={today}
                        selected={habit.id === selectedHabitId}
                        onSelect={() => onSelectHabit(habit.id)}
                    />
                ))}
            </ul>
        </section>
    );
}
