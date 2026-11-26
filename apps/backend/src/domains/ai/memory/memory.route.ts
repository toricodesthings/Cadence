import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
    clearMemoryQuerySchema,
    routineDurationKeySchema,
    routineDurationQuerySchema,
    routineDurationSchema,
    durationAskSchema,
    durationReportSchema,
    durationShownSchema,
    durationTaskSchema,
    memoryPageQuerySchema,
    setMemoryModeSchema,
    type MemoryPage,
} from "@cadence/contracts/memory";
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
import {
    askDuration,
    clearReports,
    deleteReport,
    deleteRoutineReport,
    durationEvidence,
    getReport,
    getRoutineReport,
    reportDuration,
    reportRoutine,
    spendDuration,
} from "./duration";
import { clearPlanning, planningEvidence, planningOffers, recordOfferOutcome } from "./planning.service";
import {
    UNDO_WINDOW_MINUTES,
    clearFacts,
    deleteFact,
    forgetFact,
    listFacts,
    listForgotten,
    restoreFact,
} from "./memory-store";
import { scheduleScrub } from "./queue";

const MAX_REPORTS_PER_DAY = 200;

const undoQuerySchema = z.object({
    undo: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => v === "true"),
});

async function readPage(tx: Tx, userId: string, cursor?: string): Promise<MemoryPage> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    const state = memoryStateOf(row?.settings);
    const choiceAt = row?.settings?.assistant?.memoryChoiceAt ?? null;
    const { facts, nextCursor } = await listFacts(tx, userId, cursor);
    return {
        mode: state.stored,
        choiceAt,
        inactive: !isLearning(state.mode),
        catchUp:
            state.mode === "full"
                ? catchUpOf(row?.settings?.assistant?.memoryBackfill as Backfill | null | undefined, new Date())
                : null,
        facts,
        nextCursor,
        forgotten: cursor ? [] : await listForgotten(tx, userId),
    };
}

async function writeMode(
    tx: Tx,
    userId: string,
    mode: "off" | "basic" | "full" | null,
    chosen: boolean,
    extra: Record<string, unknown> = {},
): Promise<MemoryState> {
    const now = new Date();
    const [row] = await tx
        .select({ settings: users.settings })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .for("update");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped JSON / Hono generic boundary
    const settings = (row?.settings ?? {}) as Record<string, any>;
    const assistant = (settings.assistant ?? {}) as Record<string, unknown>;
    const before = memoryStateOf(settings);
    const epoch = before.epoch + 1;
    const backfill =
        (mode ?? before.mode) === "full"
            ? before.mode === "full"
                ? ((assistant.memoryBackfill as Backfill | null | undefined) ?? null)
                : newBackfill(now)
            : null;
    await tx
        .update(users)
        .set({
            settings: {
                ...settings,
                assistant: {
                    ...assistant,
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

async function withinReportBudget(env: Env, userId: string) {
    if (
        !(await withinDailyBudget(
            env,
            "duration-report",
            await hashIdentifier(userId),
            MAX_REPORTS_PER_DAY,
            new Date(),
            { failOpen: true },
        ))
    ) {
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
            await writeMode(tx, userId, mode, true);
            return readPage(tx, userId);
        });
        return c.json({ data: page });
    })

    .post("/duration", apiValidator("json", durationReportSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        await withinReportBudget(c.env, userId);
        const view = await withRls(getDbClient(c.env), userId, (tx) => reportDuration(tx, userId, body));
        return c.json({ data: view });
    })

    .post("/duration/routine", apiValidator("json", routineDurationSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        await withinReportBudget(c.env, userId);
        const view = await withRls(getDbClient(c.env), userId, (tx) => reportRoutine(tx, userId, body));
        return c.json({ data: view });
    })

    .post("/planning/offer", apiValidator("json", planningOfferOutcomeSchema), async (c) => {
        const userId = c.get("userId");
        const body = c.req.valid("json");
        await withRls(getDbClient(c.env), userId, (tx) => recordOfferOutcome(tx, userId, body));
        return c.json({ data: { ok: true } });
    })

    .post("/duration/ask", apiValidator("json", durationAskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId } = c.req.valid("json");
        const asked = await withRls(getDbClient(c.env), userId, (tx) => askDuration(tx, userId, taskId));
        return c.json({ data: asked ? { ask: true as const, ...asked } : { ask: false as const } });
    })

    .post("/duration/shown", apiValidator("json", durationShownSchema), async (c) => {
        const userId = c.get("userId");
        const { token } = c.req.valid("json");
        await withRls(getDbClient(c.env), userId, (tx) => spendDuration(tx, userId, token));
        return c.json({ data: { ok: true } });
    })

    .get("/duration/routine", apiValidator("query", routineDurationQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { habitId, day, time } = c.req.valid("query");
        const report = await withRls(getDbClient(c.env), userId, (tx) =>
            getRoutineReport(tx, userId, { habitId, day, time }),
        );
        return c.json({ data: report });
    })

    .get("/duration", apiValidator("query", durationTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId, completedAt } = c.req.valid("query");
        const report = await withRls(getDbClient(c.env), userId, (tx) => getReport(tx, userId, taskId, completedAt));
        return c.json({ data: report });
    })

    .get("/planning/offers", async (c) => {
        const userId = c.get("userId");
        const offers = await withRls(getDbClient(c.env), userId, (tx) => planningOffers(tx, userId));
        return c.json({ data: offers });
    })

    .get("/planning-evidence", async (c) => {
        const userId = c.get("userId");
        const evidence = await withRls(getDbClient(c.env), userId, (tx) => planningEvidence(tx, userId));
        return c.json({ data: evidence });
    })

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

    .delete("/duration", apiValidator("json", durationTaskSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId, completedAt } = c.req.valid("json");
        await withRls(getDbClient(c.env), userId, (tx) => deleteReport(tx, userId, taskId, completedAt));
        return c.json({ data: { ok: true } });
    })

    .delete("/", apiValidator("query", clearMemoryQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { turnOff } = c.req.valid("query");
        const page = await withRls(getDbClient(c.env), userId, async (tx) => {
            await writeMode(tx, userId, turnOff ? "off" : null, false, {
                memoryLearningNotBefore: new Date().toISOString(),
            });
            await clearFacts(tx, userId);
            await tx.delete(aiMemorySignals).where(eq(aiMemorySignals.userId, userId));
            await clearReports(tx, userId);
            await clearPlanning(tx, userId);
            return readPage(tx, userId);
        });
        return c.json({ data: page });
    })

    .delete("/:id", apiValidator("param", uuidParamSchema), apiValidator("query", undoQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const { undo } = c.req.valid("query");
        await withRls(getDbClient(c.env), userId, async (tx) => {
            const done = undo ? await deleteFact(tx, userId, id) : !!(await forgetFact(tx, userId, id));
            throwIfNotFound(done || null, "Memory");
        });
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
