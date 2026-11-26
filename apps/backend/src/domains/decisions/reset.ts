import { OPEN_TASK_STATES } from "@cadence/contracts/task";
import { and, eq, inArray } from "drizzle-orm";
import { RESET_DISPOSITIONS, type ResetDisposition, type ResetSuggestionsRequest } from "@cadence/contracts/planning";
import { addDays, daysBetween, dayOf, formatInZone, todayIn, type Zone } from "@cadence/domain/time";
import { weekRoom } from "@cadence/domain/fit-day";
import { inboxItems, projects, taskMetrics, tasks } from "../../db/schema";
import { getDbClient } from "../../platform/db";
import { hashIdentifier } from "../../platform/log";
import { withLoadShares } from "../../platform/load-share";
import { withRls } from "../../platform/rls";
import { userZone } from "../../platform/user-zone";
import { readTasks } from "../tasks/tasks.service";
import { dayHours } from "../ai/tools/calendar";
import { planningSaid } from "../ai/memory/memory.service";
import type { Env } from "../../types/env";
import { decide, decisionModel, smartPlacementOn, type DecisionKind, type DecisionQuestion } from "./decision";
import instructions from "../../prompts/decisions/reset-disposition.md";

const INSTRUCTIONS = instructions.trimEnd();
const TITLE_CHARS = 200;
const MEMORY_CHARS = 600;
const MOVE_WINDOW_DAYS = 28;

const LABELS: Record<ResetDisposition, string> = {
    today: "Do it today.",
    this_week: "Later this week, on a day with room.",
    next_week: "Next week.",
    later: "No day for now: set it aside for later.",
    activate: "Stop waiting: do it today.",
    keep_waiting: "Keep waiting.",
};

export type ResetRow = { id: string; options: readonly string[]; facts: Record<string, unknown> };
type Row = ResetRow;

export async function resetSuggestions(
    env: Env,
    userId: string,
    { step, ids }: ResetSuggestionsRequest,
): Promise<Record<string, ResetDisposition>> {
    if (!decisionModel(env)) return {};
    const loaded = await withRls(getDbClient(env), userId, async (tx) => {
        if (!(await smartPlacementOn(tx, userId))) return null;
        const zone: Zone = await userZone(tx, userId);
        const today = todayIn(zone);
        const age = (instant: string) => daysBetween(dayOf(instant, zone), today);
        const lists = new Map(
            (
                await tx
                    .select({ id: projects.id, name: projects.name })
                    .from(projects)
                    .where(eq(projects.userId, userId))
            ).map((p) => [p.id, p.name]),
        );

        let rows: Row[];
        if (step === "captures") {
            const found = await tx
                .select({
                    id: inboxItems.id,
                    rawText: inboxItems.rawText,
                    createdAt: inboxItems.createdAt,
                    analysis: inboxItems.analysis,
                })
                .from(inboxItems)
                .where(
                    and(eq(inboxItems.userId, userId), inArray(inboxItems.id, ids), eq(inboxItems.processed, false)),
                );
            rows = found.map((c) => {
                const analysis = (c.analysis ?? {}) as {
                    suggestedPlacement?: { projectId?: string };
                    suggestedEffort?: { effort?: string };
                };
                return {
                    id: c.id,
                    options: RESET_DISPOSITIONS.captures,
                    facts: {
                        text: c.rawText.slice(0, TITLE_CHARS),
                        ageDays: age(c.createdAt),
                        ...(analysis.suggestedPlacement?.projectId && {
                            list: lists.get(analysis.suggestedPlacement.projectId),
                        }),
                        ...(analysis.suggestedEffort?.effort && { effortGuess: analysis.suggestedEffort.effort }),
                    },
                };
            });
        } else {
            const found = await tx
                .select({
                    id: tasks.id,
                    title: tasks.title,
                    state: tasks.state,
                    projectId: tasks.projectId,
                    createdAt: tasks.createdAt,
                    updatedAt: tasks.updatedAt,
                    dueDate: tasks.dueDate,
                    effort: tasks.effort,
                    durationEstimate: tasks.durationEstimate,
                    waitingOn: tasks.waitingOn,
                    waitingReminder: tasks.waitingReminder,
                    moves: taskMetrics.rescheduleCount,
                    lastMoved: taskMetrics.lastRescheduledAt,
                })
                .from(tasks)
                .leftJoin(taskMetrics, eq(taskMetrics.taskId, tasks.id))
                .where(and(eq(tasks.userId, userId), inArray(tasks.id, ids), inArray(tasks.state, OPEN_TASK_STATES)));
            rows = found.map((t) => {
                const waiting = t.state === "WAITING";
                return {
                    id: t.id,
                    options: waiting ? RESET_DISPOSITIONS.waiting : RESET_DISPOSITIONS.unscheduled,
                    facts: {
                        title: t.title.slice(0, TITLE_CHARS),
                        ...(t.projectId && { list: lists.get(t.projectId) }),
                        ageDays: age(t.createdAt),
                        movesLast28Days: t.lastMoved && age(t.lastMoved) <= MOVE_WINDOW_DAYS ? (t.moves ?? 0) : 0,
                        ...(t.dueDate && { dueInDays: daysBetween(today, t.dueDate) }),
                        ...(t.effort && { effort: ["low", "medium", "high"][t.effort - 1] }),
                        ...(t.durationEstimate && { minutes: t.durationEstimate }),
                        ...(waiting && {
                            waitingOn: t.waitingOn?.slice(0, 80) ?? null,
                            daysWaiting: age(t.updatedAt),
                            ...(t.waitingReminder && { checkInDay: dayOf(t.waitingReminder, zone) }),
                        }),
                    },
                };
            });
        }
        if (!rows.length) return null;

        const weekTasks = await readTasks(tx, userId, { from: today, to: addDays(today, 6) }, { shared: true });
        const week = weekRoom(await withLoadShares(tx, userId, weekTasks), {
            from: today,
            days: 7,
            zone,
            ...(await dayHours(tx, userId)),
        });
        const said = await planningSaid(tx, userId, MEMORY_CHARS);
        return {
            rows,
            state: {
                today: `${today} ${formatInZone(today, "UTC", { weekday: "short" }, "en-US")}`,
                week: week.map((d) => ({ day: d.day, openMinutes: d.openMinutes })),
                ...(said && { theySaid: said }),
                rows: Object.fromEntries(rows.map((r, i) => [`r${i + 1}`, r.facts])),
            },
        };
    });
    if (!loaded) return {};
    return askReset(env, loaded.rows, loaded.state, await hashIdentifier(userId));
}

export function resetQuestions(rows: readonly Row[]): {
    questions: Record<string, DecisionQuestion>;
    kinds: Record<string, DecisionKind>;
} {
    const questions: Record<string, DecisionQuestion> = {};
    const kinds: Record<string, DecisionKind> = {};
    rows.forEach((row, i) => {
        const name = `r${i + 1}`;
        kinds[name] = "reset_disposition";
        questions[name] = {
            type: "choice",
            instructions: `${INSTRUCTIONS}\nThis question is about row ${name}.`,
            candidates: row.options
                .filter((o) => o !== "none")
                .map((o) => ({ id: o, label: LABELS[o as ResetDisposition] })),
        };
    });
    return { questions, kinds };
}

async function askReset(
    env: Env,
    rows: readonly Row[],
    state: object,
    userHash?: string,
): Promise<Record<string, ResetDisposition>> {
    const answers = await decide(env, { ...resetQuestions(rows), state, userHash });
    return Object.fromEntries(
        rows.flatMap((row, i) => {
            const id = answers[`r${i + 1}`]?.id;
            return id ? [[row.id, id as ResetDisposition]] : [];
        }),
    );
}
