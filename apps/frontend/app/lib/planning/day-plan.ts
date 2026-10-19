/**
 * Find a time, on the device: the day's gaps for one task, ordered by what the person likes. The rule itself is
 * `@cadence/domain/find-time` (the assistant's `find_time` runs the same one); this only gathers its inputs.
 */
import type { PlanningEvidence } from "@cadence/contracts/planning";
import type { Task } from "@cadence/contracts/task";
import { busyBlocks, feasibleBuckets, findTimes, type Busy, type FindTimeInput, type Proposal } from "@cadence/domain/find-time";
import { preferredBuckets } from "@cadence/domain/slot-preference";
import { taskMinutes } from "@cadence/domain/task-length";
import { formatInZone, todayIn, type LocalDate, type Zone } from "@cadence/domain/time";
import type { DurationGuess } from "@cadence/nlp/duration";
import { formatChipTime } from "../utils/date-format";

export interface DayPlanInput {
    task: Pick<Task, "id" | "title" | "projectId" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "notBefore">;
    listName: string | null;
    day: LocalDate;
    zone: Zone;
    now: Date;
    /** The day's tasks as the schedule reads them (series already expanded). */
    dayTasks: readonly (Pick<Task, "id" | "state" | "scheduledStart" | "scheduledEnd"> & { isHabit?: boolean })[];
    timelineStartHour: number;
    evidence: PlanningEvidence | undefined;
    guess: Pick<DurationGuess, "state" | "minutes"> | null;
}

export interface DayPlan {
    minutes: number;
    proposals: Proposal[];
    /** The blocks the proposals keep clear of: what a small timeline draws. */
    busy: Busy[];
}

/** The proposals for `day`, best first: the person's stated or learned time of day first, then earliest. Empty when nothing fits. */
export function planDay(input: DayPlanInput): DayPlan {
    const { task, day, zone } = input;
    const minutes = taskMinutes(task, input.guess);
    const rule: FindTimeInput = {
        task: { minutes, notBefore: task.notBefore ?? null, currentStart: task.scheduledStart },
        day, zone,
        now: input.now.toISOString(),
        timelineStartHour: input.timelineStartHour,
        // A routine takes no room: it is a point in the day, never a block to keep clear of.
        busy: busyBlocks(input.dayTasks.filter((t) => !t.isHabit), task.id),
        preferred: [],
    };
    const preferred = preferredBuckets(
        input.evidence ?? { records: [], stated: [] },
        { title: task.title, projectId: task.projectId ?? null, listName: input.listName },
        feasibleBuckets(rule),
        todayIn(zone, input.now),
    );
    return { minutes, proposals: findTimes({ ...rule, preferred }), busy: rule.busy };
}

/** "Tue 2:00 – 2:45pm": the proposal as a person reads it. */
export const proposalLabel = (proposal: Pick<Proposal, "start" | "end">, zone: Zone) =>
    `${formatInZone(proposal.start, zone, { weekday: "short" })} ${formatChipTime(proposal.start, proposal.end)}`;

/** The clock time alone, "2:00 PM" or "14:00" by the person's setting. */
export { formatTime as proposalTime } from "../utils/date-format";
