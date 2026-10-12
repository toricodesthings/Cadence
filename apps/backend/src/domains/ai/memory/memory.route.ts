/**
 * "What Cadence knows": the page's data, the mode choice, and forget / undo / clear.
 * The mode is written only here: the settings PATCH refuses those fields, so neither a client
 * nor the model can forge consent. Every change bumps `memoryEpoch`, which fences background writes.
 */
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { clearMemoryQuerySchema, durationReportSchema, setMemoryModeSchema, type MemoryPage } from "@cadence/contracts/memory";
import { uuidParamSchema } from "@cadence/contracts/common";
import { aiMemorySignals, tasks, users } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import { throwIfNotFound } from "../../../platform/errors";
import { apiValidator } from "../../../platform/validation";
import type { AuthVariables } from "../../../platform/auth";
import type { Tx } from "../../../types/db";
import type { Env } from "../../../types/env";
import { recordPersonActivity } from "./memory.service";
import { isLearning, memoryStateOf, readMemoryState, type MemoryState } from "./memory-mode";
import { catchUpOf, newBackfill, type Backfill } from "./backfill";
import { clearFacts, deleteFact, forgetFact, listFacts, listForgotten, restoreFact } from "./memory-store";

const undoQuerySchema = z.object({ undo: z.enum(["true", "false"]).optional().transform((v) => v === "true") });

async function readPage(tx: Tx, userId: string): Promise<MemoryPage> {
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1);
    const state = memoryStateOf(row?.settings);
    const choiceAt = row?.settings?.assistant?.memoryChoiceAt ?? null;
    return {
        mode: state.mode,
        choiceAt,
        inactive: !isLearning(state.mode),
        catchUp: state.mode === "full" ? catchUpOf(row?.settings?.assistant?.memoryBackfill as Backfill | null | undefined, new Date()) : null,
        facts: await listFacts(tx, userId),
        forgotten: await listForgotten(tx, userId),
    };
}

/**
 * Writes the mode and its stamps under a row lock, so two changes can't interleave and a background write
 * holding the row (`fenceMemoryState`) finishes first. Returns the state before.
 */
async function writeMode(tx: Tx, userId: string, mode: "off" | "basic" | "full", consentVersion: string | null): Promise<MemoryState> {
    const now = new Date();
    const [row] = await tx.select({ settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1).for("update");
    const settings = (row?.settings ?? {}) as Record<string, any>;
    const assistant = (settings.assistant ?? {}) as Record<string, unknown>;
    const before = memoryStateOf(settings);
    const epoch = before.epoch + 1;
    // Becoming Full starts the 90-day catch-up; leaving it ends it.
    const backfill = mode === "full" ? (before.mode === "full" ? (assistant.memoryBackfill as Backfill | null | undefined) ?? null : newBackfill(now)) : null;
    await tx
        .update(users)
        .set({
            settings: {
                ...settings,
                assistant: {
                    ...assistant,
                    memoryMode: mode,
                    ...(consentVersion && { memoryChoiceAt: now.toISOString(), memoryConsentVersion: consentVersion }),
                    memoryEpoch: epoch,
                    memoryBackfill: backfill,
                },
            },
        })
        .where(eq(users.id, userId));
    return before;
}

export const memoryRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>()
    .get("/", async (c) => {
        const userId = c.get("userId");
        const page = await withRls(getDbClient(c.env), userId, (tx) => readPage(tx, userId));
        return c.json({ data: page });
    })

    .post("/mode", apiValidator("json", setMemoryModeSchema), async (c) => {
        const userId = c.get("userId");
        const { mode, consentVersion } = c.req.valid("json");
        const page = await withRls(getDbClient(c.env), userId, async (tx) => {
            // A mode change only starts or stops learning: nothing stored is erased (that is Clear, below).
            await writeMode(tx, userId, mode, consentVersion);
            return readPage(tx, userId);
        });
        return c.json({ data: page });
    })

    // "How long did it take?": an optional answer from the person, kept for Full's durations. Nothing in the
    // response depends on the mode, so asking never reveals it; Basic and Off record nothing.
    .post("/duration", apiValidator("json", durationReportSchema), async (c) => {
        const userId = c.get("userId");
        const { taskId, minutes } = c.req.valid("json");
        const task = await withRls(getDbClient(c.env), userId, async (tx) => {
            const [row] = await tx.select({ title: tasks.title }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
            return row;
        });
        throwIfNotFound(task, "Task");
        await recordPersonActivity(c.env, userId, [{ kind: "duration", subject: task!.title, minutes }]);
        return c.json({ data: { ok: true } });
    })

    // Clear all: every fact in one confirmation; `turnOff` also switches memory off.
    .delete("/", apiValidator("query", clearMemoryQuerySchema), async (c) => {
        const userId = c.get("userId");
        const { turnOff } = c.req.valid("query");
        const page = await withRls(getDbClient(c.env), userId, async (tx) => {
            // The mode first: its row lock waits out any background write, which locks that row before the facts.
            await writeMode(tx, userId, turnOff ? "off" : (await readMemoryState(tx, userId)).mode ?? "off", null);
            await clearFacts(tx, userId);
            // The signals go too, or tonight's pass would count the same patterns back.
            await tx.delete(aiMemorySignals).where(eq(aiMemorySignals.userId, userId));
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
        return c.json({ data: { id } });
    })

    .post("/:id/restore", apiValidator("param", uuidParamSchema), async (c) => {
        const userId = c.get("userId");
        const { id } = c.req.valid("param");
        const fact = await withRls(getDbClient(c.env), userId, (tx) => restoreFact(tx, userId, id));
        throwIfNotFound(fact, "Memory");
        return c.json({ data: fact });
    });
