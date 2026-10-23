/**
 * "What Cadence knows": the page's data, the mode choice, and forget / undo / clear.
 * The mode is written only here: the settings PATCH refuses those fields, so neither a client
 * nor the model can forge consent. Every change bumps `memoryEpoch`, which fences background writes.
 */
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { clearMemoryQuerySchema, routineDurationKeySchema, routineDurationQuerySchema, routineDurationSchema, durationAskSchema, durationReportSchema, durationShownSchema, durationTaskSchema, memoryPageQuerySchema, setMemoryModeSchema, type MemoryPage } from "@cadence/contracts/memory";
import { uuidParamSchema } from "@cadence/contracts/common";
import { planningOfferOutcomeSchema } from "@cadence/contracts/planning";
import { aiMemorySignals, users } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { withinDailyBudget } from "../../../platform/daily-budget";
import { AppError, throwIfNotFound } from "../../../platform/errors";
import { hashIdentifier } from "../../../platform/log";
import { apiValidator } from "../../../platform/validation";
import type { AuthVariables } from "../../../platform/auth";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import { isLearning, memoryStateOf, type MemoryState } from "./memory-mode";
import { catchUpOf, newBackfill, type Backfill } from "./backfill";
import { askDuration, clearReports, deleteReport, deleteRoutineReport, durationEvidence, getReport, getRoutineReport, reportDuration, reportRoutine, spendDuration } from "./duration";
import { clearPlanning, planningEvidence, planningOffers, recordOfferOutcome } from "./planning.service";
import { UNDO_WINDOW_MINUTES, clearFacts, deleteFact, forgetFact, listFacts, listForgotten, restoreFact } from "./memory-store";
import { scheduleScrub } from "./queue";

/** Answers one person can store a day: far beyond real use, a bound against a script. */
const MAX_REPORTS_PER_DAY = 200;

const undoQuerySchema = z.object({ undo: z.enum(["true", "false"]).optional().transform((v) => v === "true") });

async function readPage(tx: Tx, userId: string, cursor?: string): Promise<MemoryPage> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    const state = memoryStateOf(row?.settings);
    const choiceAt = row?.settings?.assistant?.memoryChoiceAt ?? null;
    const { facts, nextCursor } = await listFacts(tx, userId, cursor);
    return {
        // The stored choice: null while the person hasn't chosen (Basic is in effect), so the page can say "Basic (default)".
        mode: state.stored,
        choiceAt,
        inactive: !isLearning(state.mode),
        catchUp: state.mode === "full" ? catchUpOf(row?.settings?.assistant?.memoryBackfill as Backfill | null | undefined, new Date()) : null,
        facts,
        nextCursor,
        forgotten: cursor ? [] : await listForgotten(tx, userId),
    };
}

/**
 * Writes the mode and its stamps under a row lock, so two changes can't interleave and a background write
 * holding the row (`fenceMemoryState`) finishes first. Returns the state before.
 */
async function writeMode(tx: Tx, userId: string, mode: "off" | "basic" | "full" | null, chosen: boolean, extra: Record<string, unknown> = {}): Promise<MemoryState> {
    const now = new Date();
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1).for("update");
    const settings = (row?.settings ?? {}) as Record<string, any>;
    const assistant = (settings.assistant ?? {}) as Record<string, unknown>;
    const before = memoryStateOf(settings);
    const epoch = before.epoch + 1;
    // Becoming Full starts the 90-day catch-up; leaving it ends it.
    const backfill = (mode ?? before.mode) === "full" ? (before.mode === "full" ? (assistant.memoryBackfill as Backfill | null | undefined) ?? null : newBackfill(now)) : null;
    await tx
        .update(users)
        .set({
            settings: {
                ...settings,
                assistant: {
                    ...assistant,
                    // `null` keeps the stored choice (Clear on an unchosen memory stays unchosen).
                    memoryMode: mode ?? before.stored,
                    ...(chosen && { memoryChoiceAt: now.toISOString() }),
                    memoryEpoch: epoch,
                    memoryBackfill: backfill,
                    ...extra,
                },
            },
        })
        .where(eq(users.id, userId));
    return before;
}

/** "How long did it take?" answers share one daily cap per person (it fails open if the budget store is down). */
async function withinReportBudget(env: Env, userId: string) {
    if (!(await withinDailyBudget(env, "duration-report", await hashIdentifier(userId), MAX_REPORTS_PER_DAY, new Date(), { failOpen: true }))) {
        throw new AppError(429, "TOO_MANY_REQUESTS", "Too many answers today");
    }
}

export const memoryRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .get("/", apiValidator("query", memoryPageQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { cursor } = c.req.valid("query");
        const page = await withRls(getDbClient(c.env), userId, (tx) => readPage(tx, userId, cursor));
        return c.json({ data: page });
    })

    .post("/mode", apiValidator("json", setMemoryModeSchema), async (c) => {
        const userId = c.get("userId");
        const { mode } = c.req.valid("json");
        const page = await withRls(getDbClient(c.env), userId, async (tx) => {
            // A mode change only starts or stops learning: nothing stored is erased (that is Clear, below).
            await writeMode(tx, userId, mode, true);
            return readPage(tx, userId);
        });
        return c.json({ data: page });
    })

    // "How long did it take?": an optional answer from the person, kept for Full's durations. It is stored in its own
    // transaction and the stored row comes back (or a normal error), so the app says Saved only when it is. Basic and
    // Off store nothing and the answer doesn't reveal the mode (200, null). One report per completion: a second answer
    // replaces the first.
    .post("/duration", apiValidator("json", durationReportSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        await withinReportBudget(c.env, userId);
        const view = await withRls(getDbClient(c.env), userId, (tx) => reportDuration(tx, userId, body));
        return c.json({ data: view });
    })

    // How long a routine took on one marked day. Same promises as a task's answer: stored in its own transaction, the
    // stored row comes back, Basic and Off store nothing (200, null).
    .post("/duration/routine", apiValidator("json", routineDurationSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        await withinReportBudget(c.env, userId);
        const view = await withRls(getDbClient(c.env), userId, (tx) => reportRoutine(tx, userId, body));
        return c.json({ data: view });
    })

    // Not now on a planning offer, or the offered thing done. Stored only in Full (200 either way).
    .post("/planning/offer", apiValidator("json", planningOfferOutcomeSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        await withRls(getDbClient(c.env), userId, (tx) => recordOfferOutcome(tx, userId, body));
        return c.json({ data: { ok: true } });
    })

    // Should the question be asked? The server owns the budget and reserves the day when it says yes, so two devices
    // never ask twice in a day.
    .post("/duration/ask", apiValidator("json", durationAskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId } = c.req.valid("json");
        const asked = await withRls(getDbClient(c.env), userId, (tx) => askDuration(tx, userId, taskId));
        return c.json({ data: asked ? { ask: true as const, ...asked } : { ask: false as const } });
    })

    // The question rendered: one miss per token.
    .post("/duration/shown", apiValidator("json", durationShownSchema), async (c) => {
        const userId = c.get("userId");
        const { token } = c.req.valid("json");
        await withRls(getDbClient(c.env), userId, (tx) => spendDuration(tx, userId, token));
        return c.json({ data: { ok: true } });
    })

    .get("/duration/routine", apiValidator("query", routineDurationQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { habitId, day, time } = c.req.valid("query");
        const report = await withRls(getDbClient(c.env), userId, (tx) => getRoutineReport(tx, userId, { habitId, day, time }));
        return c.json({ data: report });
    })

    .get("/duration", apiValidator("query", durationTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId, completedAt } = c.req.valid("query");
        const report = await withRls(getDbClient(c.env), userId, (tx) => getReport(tx, userId, taskId, completedAt));
        return c.json({ data: report });
    })

    // The tasks each planning offer may show on. The app shows at most one, the first in its own order.
    .get("/planning/offers", async (c) => {
        const userId = c.get("userId");
        const offers = await withRls(getDbClient(c.env), userId, (tx) => planningOffers(tx, userId));
        return c.json({ data: offers });
    })

    // What Find a time orders by (the same pure rule runs on the device).
    .get("/planning-evidence", async (c) => {
        const userId = c.get("userId");
        const evidence = await withRls(getDbClient(c.env), userId, (tx) => planningEvidence(tx, userId));
        return c.json({ data: evidence });
    })

    // The estimator's input: the person's own answers (Full only, else nothing).
    .get("/duration-evidence", async (c) => {
        const userId = c.get("userId");
        const rows = await withRls(getDbClient(c.env), userId, (tx) => durationEvidence(tx, userId));
        return c.json({ data: rows });
    })

    .delete("/duration/routine", apiValidator("json", routineDurationKeySchema), async (c) => {
        const userId = c.get("userId");
        const key = c.req.valid("json");
        await withRls(getDbClient(c.env), userId, (tx) => deleteRoutineReport(tx, userId, key));
        return c.json({ data: { ok: true } });
    })

    // Clearing the answer (the task's "Took 45 min" row).
    .delete("/duration", apiValidator("json", durationTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId, completedAt } = c.req.valid("json");
        await withRls(getDbClient(c.env), userId, (tx) => deleteReport(tx, userId, taskId, completedAt));
        return c.json({ data: { ok: true } });
    })

    // Clear all: every fact in one confirmation; `turnOff` also switches memory off.
    .delete("/", apiValidator("query", clearMemoryQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { turnOff } = c.req.valid("query");
        const page = await withRls(getDbClient(c.env), userId, async (tx) => {
            // The mode first: its row lock waits out any background write, which locks that row before the facts.
            // Saying something again teaches it again; nothing said before now is read back (backfill, notes, chats).
            await writeMode(tx, userId, turnOff ? "off" : null, false, { memoryLearningNotBefore: new Date().toISOString() });
            await clearFacts(tx, userId);
            // The signals go too, or tonight's pass would count the same patterns back.
            await tx.delete(aiMemorySignals).where(eq(aiMemorySignals.userId, userId));
            await clearReports(tx, userId);
            await clearPlanning(tx, userId);
            return readPage(tx, userId);
        });
        return c.json({ data: page });
    })

    // Forget one fact (Undo for 10 minutes). `?undo=true` is Undo of a save: the row goes entirely, no tombstone.
    .delete("/:id", apiValidator("param", uuidParamSchema), apiValidator("query", undoQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { undo } = c.req.valid("query");
        await withRls(getDbClient(c.env), userId, async (tx) => {
            const done = undo ? await deleteFact(tx, userId, id) : !!(await forgetFact(tx, userId, id));
            throwIfNotFound(done || null, "Memory");
        });
        // The text is kept for Undo, then reduced to a label.
        if (!undo) c.executionCtx.waitUntil(scheduleScrub(c.env, userId, UNDO_WINDOW_MINUTES));
        return c.json({ data: { id } });
    })

    .post("/:id/restore", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const fact = await withRls(getDbClient(c.env), userId, (tx) => restoreFact(tx, userId, id));
        throwIfNotFound(fact, "Memory");
        return c.json({ data: fact });
    });
