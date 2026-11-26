import type { PlanningEvidence } from "@cadence/contracts/planning";
import type { Task } from "@cadence/contracts/task";
import {
    busyBlocks,
    feasibleBuckets,
    findTimes,
    type Busy,
    type FindTimeInput,
    type Proposal,
} from "@cadence/domain/find-time";
import { preferredBuckets } from "@cadence/domain/slot-preference";
import { taskMinutes } from "@cadence/domain/task-length";
import { formatInZone, todayIn, type LocalDate, type Zone } from "@cadence/domain/time";
import type { DurationGuess } from "@cadence/nlp/duration";
import { formatChipTime } from "../utils/date-format";

export interface DayPlanInput {
    task: Pick<
        Task,
        "id" | "title" | "projectId" | "scheduledStart" | "scheduledEnd" | "durationEstimate" | "notBefore"
    >;
    listName: string | null;
    day: LocalDate;
    zone: Zone;
    now: Date;
    dayTasks: readonly (Pick<Task, "id" | "state" | "scheduledStart" | "scheduledEnd"> & { isHabit?: boolean })[];
    timelineStartHour: number;
    dayEndHour?: number;
    evidence: PlanningEvidence | undefined;
    guess: Pick<DurationGuess, "state" | "minutes"> | null;
}

export interface DayPlan {
    minutes: number;
    proposals: Proposal[];
    busy: Busy[];
}

export function planDay(input: DayPlanInput): DayPlan {
    const { task, day, zone } = input;
    const minutes = taskMinutes(task, input.guess);
    const rule: FindTimeInput = {
        task: { minutes, notBefore: task.notBefore ?? null, currentStart: task.scheduledStart },
        day,
        zone,
        now: input.now.toISOString(),
        timelineStartHour: input.timelineStartHour,
        dayEndHour: input.dayEndHour,
        busy: busyBlocks(
            input.dayTasks.filter((t) => !t.isHabit),
            task.id,
        ),
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

export const proposalLabel = (proposal: Pick<Proposal, "start" | "end">, zone: Zone) =>
    `${formatInZone(proposal.start, zone, { weekday: "short" })} ${formatChipTime(proposal.start, proposal.end)}`;

export { formatTime as proposalTime } from "../utils/date-format";
