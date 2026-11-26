import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import type {
    FindTimeBody,
    PlanningEvidence,
    PlanningOffer,
    PlanningOfferOutcome,
    PlanningOffers,
    TimeOfDay,
} from "@cadence/contracts/planning";
import { bucketOf, dayHoursOf, feasibleBuckets, busyBlocks } from "@cadence/domain/find-time";
import { eligibleOffers, type OfferDecline, type OfferTask } from "@cadence/domain/planning-offers";
import { learnedPreference, type SlotRecord } from "@cadence/domain/slot-preference";
import { addDays, dayOf, formatInZone, todayIn, type LocalDate } from "@cadence/domain/time";
import { taskMinutes } from "@cadence/domain/task-length";
import { aiMemories, aiMemorySignals, planningRecords, projects, subtasks, tasks, users } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { userZone } from "../../../platform/user-zone";
import { logger, issuesFromError } from "../../../platform/log";
import { readTasks } from "../../tasks/tasks.service";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import { fenceMemoryState, planningOn, readMemoryState } from "./memory-mode";
import { contentHash, usableBy } from "./memory-store";
import type { DerivedFact } from "./signals";

export const PLANNING_RETENTION_DAYS = 90;
const MAX_REPLAY_AGE_MS = 60 * 60_000;
const MAX_EVIDENCE_RECORDS = 500;

export const slotGroup = (projectId: string | null) => `slot:${projectId ?? "all"}`;

async function fingerprintOf(tx: Tx, userId: string, taskId: string): Promise<string | null> {
    const [task] = await tx
        .select({ title: tasks.title, waitingOn: tasks.waitingOn })
        .from(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    if (!task) return null;
    const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(subtasks)
        .where(and(eq(subtasks.taskId, taskId), eq(subtasks.isComplete, false)));
    return contentHash(`${task.title}|${task.waitingOn ?? ""}|${n}`);
}

export interface SlotChange {
    taskId: string;
    before: { scheduledStart: string | null };
    after: {
        scheduledStart: string | null;
        scheduledEnd: string | null;
        projectId: string | null;
        durationEstimate: number | null;
        recurrenceRule: string | null;
    };
    findTime?: FindTimeBody;
    queuedAt?: string | null;
}

export async function recordSlot(env: Env, userId: string, change: SlotChange, now: Date = new Date()): Promise<void> {
    try {
        await withRls(getDbClient(env), userId, async (tx) => {
            const state = await fenceMemoryState(tx, userId);
            if (!planningOn(state) || change.after.recurrenceRule) return;
            const zone = await userZone(tx, userId);
            const today = todayIn(zone, now);
            const suggestedToday = and(
                eq(planningRecords.userId, userId),
                eq(planningRecords.taskId, change.taskId),
                eq(planningRecords.kind, "slot"),
                eq(planningRecords.suggested, true),
                eq(planningRecords.saidOn, today),
            );

            if (change.findTime?.undo) {
                await tx.delete(planningRecords).where(suggestedToday);
                return;
            }
            const start = change.after.scheduledStart;
            if (!start) return;
            const chosen = bucketOf(start, zone);

            let feasible: TimeOfDay[];
            if (change.findTime) {
                feasible = [...new Set([...(change.findTime.shown ?? []), chosen])];
                await tx.delete(planningRecords).where(suggestedToday);
            } else {
                if (change.before.scheduledStart) return;
                if (change.queuedAt && now.getTime() - Date.parse(change.queuedAt) > MAX_REPLAY_AGE_MS) return;
                const day = dayOf(start, zone);
                const [settings] = await tx
                    .select({ settings: users.settings })
                    .from(users)
                    .where(eq(users.id, userId));
                const busy = busyBlocks(await readTasks(tx, userId, { from: day, to: day }), change.taskId);
                const minutes = taskMinutes({
                    scheduledStart: start,
                    scheduledEnd: change.after.scheduledEnd,
                    durationEstimate: change.after.durationEstimate,
                });
                feasible = [
                    ...new Set([
                        ...feasibleBuckets({
                            task: { minutes, notBefore: null, currentStart: null },
                            day,
                            zone,
                            now: now.toISOString(),
                            ...dayHoursOf(settings?.settings),
                            busy,
                            preferred: [],
                        }),
                        chosen,
                    ]),
                ];
            }
            if (feasible.length < 2) return;
            await tx.insert(planningRecords).values({
                userId,
                taskId: change.taskId,
                kind: "slot",
                projectId: change.after.projectId,
                chosen,
                feasible,
                suggested: !!change.findTime,
                outcome: "chosen",
                saidOn: today,
            });
        });
    } catch (error) {
        logger.warn("ai", "planning_record_failed", { issues: issuesFromError(error) });
    }
}

export async function recordOfferOutcome(
    tx: Tx,
    userId: string,
    body: PlanningOfferOutcome,
    now: Date = new Date(),
): Promise<void> {
    if (!planningOn(await readMemoryState(tx, userId))) return;
    const fingerprint = await fingerprintOf(tx, userId, body.taskId);
    if (!fingerprint) return;
    const today = todayIn(await userZone(tx, userId), now);
    await tx
        .delete(planningRecords)
        .where(
            and(
                eq(planningRecords.userId, userId),
                eq(planningRecords.taskId, body.taskId),
                eq(planningRecords.kind, body.kind),
            ),
        );
    await tx.insert(planningRecords).values({
        userId,
        taskId: body.taskId,
        kind: body.kind,
        suggested: false,
        outcome: body.outcome,
        fingerprint,
        saidOn: today,
    });
}

export async function planningOffers(tx: Tx, userId: string, now: Date = new Date()): Promise<PlanningOffers> {
    const none = { steps: [], later: [] };
    if (!planningOn(await readMemoryState(tx, userId))) return none;
    const today = todayIn(await userZone(tx, userId), now);

    const moves = await tx
        .select({ taskId: aiMemorySignals.taskId, on: aiMemorySignals.on })
        .from(aiMemorySignals)
        .where(
            and(
                eq(aiMemorySignals.userId, userId),
                eq(aiMemorySignals.kind, "reschedule"),
                gt(aiMemorySignals.on, addDays(today, -28)),
                sql`${aiMemorySignals.taskId} IS NOT NULL`,
            ),
        );
    const movedOn = new Map<string, LocalDate[]>();
    for (const m of moves) movedOn.set(m.taskId!, [...(movedOn.get(m.taskId!) ?? []), m.on]);
    const slipping = [...movedOn].filter(([, days]) => days.length >= 3).map(([id]) => id);

    const rows = await tx
        .select({
            id: tasks.id,
            state: tasks.state,
            title: tasks.title,
            waitingOn: tasks.waitingOn,
            dueDate: tasks.dueDate,
            notBefore: tasks.notBefore,
        })
        .from(tasks)
        .where(
            and(
                eq(tasks.userId, userId),
                sql`(${tasks.state} = 'WAITING' OR ${slipping.length ? inArray(tasks.id, slipping) : sql`false`})`,
                ne(tasks.state, "COMPLETE"),
                ne(tasks.state, "ARCHIVED"),
                isNull(tasks.recurrenceRule),
            ),
        )
        .limit(300);
    if (!rows.length) return none;

    const open = await tx
        .select({ taskId: subtasks.taskId, n: sql<number>`count(*)::int` })
        .from(subtasks)
        .where(
            and(
                inArray(
                    subtasks.taskId,
                    rows.map((r) => r.id),
                ),
                eq(subtasks.isComplete, false),
            ),
        )
        .groupBy(subtasks.taskId);
    const steps = new Map(open.map((o) => [o.taskId, o.n]));

    const candidates: OfferTask[] = await Promise.all(
        rows.map(async (r) => ({
            id: r.id,
            state: r.state,
            waitingOn: r.waitingOn,
            dueDate: r.dueDate,
            notBefore: r.notBefore,
            openSteps: steps.get(r.id) ?? 0,
            fingerprint: await contentHash(`${r.title}|${r.waitingOn ?? ""}|${steps.get(r.id) ?? 0}`),
            movedOn: movedOn.get(r.id) ?? [],
        })),
    );

    const declines: OfferDecline[] = (
        await tx
            .select({
                taskId: planningRecords.taskId,
                kind: planningRecords.kind,
                fingerprint: planningRecords.fingerprint,
                saidOn: planningRecords.saidOn,
            })
            .from(planningRecords)
            .where(
                and(
                    eq(planningRecords.userId, userId),
                    inArray(planningRecords.kind, ["steps", "later"]),
                    eq(planningRecords.outcome, "declined"),
                    isNull(planningRecords.forgottenAt),
                    gt(planningRecords.saidOn, addDays(today, -PLANNING_RETENTION_DAYS)),
                ),
            )
    ).flatMap((d) =>
        d.taskId && d.fingerprint
            ? [{ taskId: d.taskId, kind: d.kind as PlanningOffer, fingerprint: d.fingerprint, saidOn: d.saidOn }]
            : [],
    );

    const avoid = await avoidedOffers(tx, userId);
    return eligibleOffers(candidates, { today, declines, avoid });
}

async function avoidedOffers(tx: Tx, userId: string): Promise<PlanningOffer[]> {
    const rows = await tx
        .select({ avoid: sql<string | null>`${aiMemories.value} ->> 'avoid'` })
        .from(aiMemories)
        .where(
            and(
                eq(aiMemories.userId, userId),
                eq(aiMemories.status, "active"),
                eq(aiMemories.kind, "assist"),
                sql`${aiMemories.value} ->> 'avoid' IN ('steps', 'later')`,
            ),
        );
    return [
        ...new Set(rows.flatMap((r): PlanningOffer[] => (r.avoid === "steps" || r.avoid === "later" ? [r.avoid] : []))),
    ];
}

export async function planningEvidence(tx: Tx, userId: string, now: Date = new Date()): Promise<PlanningEvidence> {
    const state = await readMemoryState(tx, userId);
    const mode = state.mode === "off" ? null : state.mode;
    const stated = mode
        ? (
              await tx
                  .select({
                      when: sql<{ buckets: TimeOfDay[]; about: string | null } | null>`${aiMemories.value} -> 'when'`,
                  })
                  .from(aiMemories)
                  .where(
                      and(usableBy(userId, mode), eq(aiMemories.kind, "preference"), sql`${aiMemories.value} ? 'when'`),
                  )
                  .orderBy(desc(aiMemories.lastSeenOn), desc(aiMemories.createdAt))
                  .limit(20)
          ).flatMap((r) => (r.when?.buckets?.length ? [{ buckets: r.when.buckets, about: r.when.about ?? null }] : []))
        : [];
    if (!planningOn(state)) return { records: [], stated };

    const today = todayIn(await userZone(tx, userId), now);
    const rows = await tx
        .select({
            chosen: planningRecords.chosen,
            feasible: planningRecords.feasible,
            suggested: planningRecords.suggested,
            saidOn: planningRecords.saidOn,
            projectId: planningRecords.projectId,
        })
        .from(planningRecords)
        .where(
            and(
                eq(planningRecords.userId, userId),
                eq(planningRecords.kind, "slot"),
                eq(planningRecords.outcome, "chosen"),
                isNull(planningRecords.forgottenAt),
                gt(planningRecords.saidOn, addDays(today, -PLANNING_RETENTION_DAYS)),
            ),
        )
        .orderBy(desc(planningRecords.saidOn), desc(planningRecords.createdAt))
        .limit(MAX_EVIDENCE_RECORDS);
    return {
        records: rows
            .filter((r) => r.chosen && r.feasible)
            .map((r) => ({
                chosen: r.chosen as TimeOfDay,
                feasible: r.feasible as TimeOfDay[],
                suggested: r.suggested,
                saidOn: r.saidOn,
                projectId: r.projectId,
            })),
        stated,
    };
}

const PHRASE: Record<TimeOfDay, string> = {
    early: "early in the morning",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    late: "late at night",
};

export async function slotPatterns(tx: Tx, userId: string, today: LocalDate): Promise<DerivedFact[]> {
    const rows = await tx
        .select({
            chosen: planningRecords.chosen,
            feasible: planningRecords.feasible,
            suggested: planningRecords.suggested,
            saidOn: planningRecords.saidOn,
            projectId: planningRecords.projectId,
        })
        .from(planningRecords)
        .where(
            and(
                eq(planningRecords.userId, userId),
                eq(planningRecords.kind, "slot"),
                eq(planningRecords.outcome, "chosen"),
                isNull(planningRecords.forgottenAt),
                gt(planningRecords.saidOn, addDays(today, -PLANNING_RETENTION_DAYS)),
            ),
        );
    const records: SlotRecord[] = rows.flatMap((r) =>
        r.chosen && r.feasible
            ? [
                  {
                      chosen: r.chosen as TimeOfDay,
                      feasible: r.feasible as TimeOfDay[],
                      suggested: r.suggested,
                      saidOn: r.saidOn,
                      projectId: r.projectId,
                  },
              ]
            : [],
    );
    const winnerOf = (scope: SlotRecord[], projectId: string | null) =>
        learnedPreference(scope, {
            projectId,
            feasibleToday: [...new Set(scope.flatMap((r) => r.feasible))],
            today,
        })[0] ?? null;

    const names = new Map(
        (
            await tx.select({ id: projects.id, title: projects.name }).from(projects).where(eq(projects.userId, userId))
        ).map((p) => [p.id, p.title]),
    );
    const since = (scope: SlotRecord[]) =>
        formatInZone(scope.map((r) => r.saidOn).sort()[0], "UTC", { month: "long" }, "en-US");
    const fact = (scope: SlotRecord[], projectId: string | null, bucket: TimeOfDay): DerivedFact => ({
        kind: "pattern",
        key: `pattern|slot|${projectId ?? "all"}|${bucket}`,
        content: `Often plans ${projectId ? (names.get(projectId) ?? "this list").slice(0, 40) : "things"} ${PHRASE[bucket]} (${scope.length} choices since ${since(scope)})`,
        value: { group: slotGroup(projectId), signal: "slot", bucket, n: scope.length },
    });

    const overall = winnerOf(records, null);
    const out: DerivedFact[] = overall ? [fact(records, null, overall)] : [];
    for (const projectId of new Set(records.flatMap((r) => (r.projectId ? [r.projectId] : [])))) {
        const scope = records.filter((r) => r.projectId === projectId);
        const winner = scope.length >= 8 ? winnerOf(scope, projectId) : null;
        if (winner && winner !== overall) out.push(fact(scope, projectId, winner));
    }
    return out;
}

export async function prunePlanning(tx: Tx, userId: string, today: LocalDate): Promise<void> {
    await tx
        .delete(planningRecords)
        .where(
            and(
                eq(planningRecords.userId, userId),
                lt(planningRecords.saidOn, addDays(today, -PLANNING_RETENTION_DAYS)),
            ),
        );
}

export async function clearPlanning(tx: Tx, userId: string): Promise<void> {
    await tx.delete(planningRecords).where(eq(planningRecords.userId, userId));
}
