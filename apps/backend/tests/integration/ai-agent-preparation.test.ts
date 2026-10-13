import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser, asOwner, getTestDb, startTestDb } from "../helpers/db";
import { withRls } from "../../src/platform/rls";
import { syncUserZoneWithSettings } from "../../src/platform/user-zone";
import { getAgentInstance } from "../../src/domains/ai/agent";
import { createRunDiagnostics } from "../../src/domains/ai/run-diagnostics";
import type { Env } from "../../src/types/env";
import type { UserSettings } from "@cadence/contracts/settings";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
vi.mock("../../src/domains/ai/memory/embedding", () => ({ embedText: vi.fn(), getEmbeddingModelId: () => "fixture" }));
import { embedText } from "../../src/domains/ai/memory/embedding";

import { validateStoredContexts } from "../../src/domains/ai/memory/context-reuse";
import { loadContextFacts, forgetFact } from "../../src/domains/ai/memory/memory-store";
import { loadAgentSnapshot, loadSnapshot, userClock } from "../../src/domains/ai/turn";
import { buildToolRegistry } from "../../src/domains/ai/tools/index";
import * as routineReads from "../../src/domains/ai/tools/routine-reads";

let userId: string;
const now = "2026-10-13T18:00:00Z";
const env = { AI_MEMORY_COVERAGE_GATE: "true" } as Env;
const settings: UserSettings = { assistant: { memoryMode: "basic" }, dateTime: { weekStart: "Monday", timezone: "America/Toronto", timeDisplay: "12h" } };

beforeAll(startTestDb);
beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(embedText).mockRejectedValue(new Error("fixture provider unavailable"));
    userId = await createUser({ settings, zone: "UTC" });
});
async function fact(kind: string, content: string) {
    return asOwner((pg) => pg.query(`INSERT INTO ai_memories (user_id, kind, content, said_on, last_seen_on, source, confidence)
        VALUES ($1, $2::memory_kind, $3, '2026-10-01', '2026-10-01', 'chat', 'stated')`, [userId, kind, content]));
}
async function prepare(queryText = "Help me plan this afternoon", overrides: Partial<Env> = {}, provided: UserSettings = settings) {
    const diagnostics = createRunDiagnostics(() => performance.now());
    const result = await getAgentInstance({ ...env, ...overrides }, userId, {
        timezone: "America/Toronto", currentDate: now, queryText, nonce: "fixture", approvalMode: "full", settings: provided, diagnostics,
    });
    return { ...result, diagnostics: diagnostics.snapshot() };
}

describe("exact preparation", () => {
    it("avoids embedding and recall for an empty or fully covered memory without losing facts", async () => {
        await prepare();
        expect(embedText).not.toHaveBeenCalled();
        await fact("constraint", "Keep Friday evenings free");
        await fact("life", "Preparing for an exam next week");
        const result = await prepare();
        expect(embedText).not.toHaveBeenCalled();
        expect(result.turnContext).toContain("Keep Friday evenings free");
        expect(result.turnContext).toContain("Preparing for an exam next week");
        expect(result.diagnostics.memoryCoverage).toEqual({ variant: "exact", hasRecallCandidates: false, profileFacts: 2 });
        expect(result.diagnostics.phases.map((p) => p.name)).not.toContain("embedding");
        expect(result.diagnostics.phases.map((p) => p.name)).not.toContain("recall");
    });

    it("keeps lexical recall when the embedding fails and candidates exist", async () => {
        await fact("pattern", "Afternoon gardening works best");
        vi.mocked(embedText).mockRejectedValue(new Error("unavailable"));
        const result = await prepare("Help me with afternoon gardening");
        expect(embedText).toHaveBeenCalledOnce();
        expect(result.turnContext).toContain("Afternoon gardening works best");
        expect(result.diagnostics.memoryCoverage?.hasRecallCandidates).toBe(true);
        expect(result.diagnostics.phases.map((p) => p.name)).toContain("recall");
    });

    it("keeps the short-query and memory-off gates", async () => {
        await fact("pattern", "Afternoon gardening works best");
        await prepare("ok");
        expect(embedText).not.toHaveBeenCalled();
        const result = await prepare("Help with afternoon gardening", {}, { ...settings, assistant: { memoryMode: "off" } });
        expect(embedText).not.toHaveBeenCalled();
        expect(result.turnContext).not.toContain("Afternoon gardening works best");
        expect(result.diagnostics.memoryCoverage).toBeUndefined();
        expect(Object.keys(result.agent.tools)).not.toContain("recall");
    });

    it("defaults to the existing parallel path for rollback", async () => {
        await fact("constraint", "Keep Friday evenings free");
        const result = await prepare(undefined, { AI_MEMORY_COVERAGE_GATE: undefined });
        expect(embedText).toHaveBeenCalledOnce();
        expect(result.diagnostics.memoryCoverage?.variant).toBe("parallel");
        expect(result.turnContext).toContain("Keep Friday evenings free");
    });

    it("reuses synchronized settings and preserves a pinned zone", async () => {
        const synced = await withRls(getTestDb(), userId, (tx) => syncUserZoneWithSettings(tx, userId, "Europe/Paris"));
        expect(synced.timezone).toBe("America/Toronto");
        expect(synced.settings).toMatchObject(settings);
        const result = await prepare(undefined, {}, synced.settings as typeof settings);
        expect(result.turnContext).toContain("Monday");
        // Current tool reads remain fresh: the snapshot's reuse is not a global settings cache.
        expect(Object.keys(result.agent.tools)).toContain("get_events");
    });

    it("reuses validated context without snapshot, embedding or recall, but keeps current tools and zone", async () => {
        await fact("constraint", "Keep Friday evenings free");
        const first = await prepare();
        const history = [{ id: "u1", role: "user", metadata: { turnContext: first.turnContext } }];
        const valid = await validateStoredContexts(history, true,
            (ids) => withRls(getTestDb(), userId, (tx) => loadContextFacts(tx, userId, ids, "2026-10-13")));
        expect(valid[0]).toBe(history[0]);
        const diagnostics = createRunDiagnostics(() => performance.now());
        const next = await getAgentInstance(env, userId, { timezone: "Europe/Paris", currentDate: now,
            queryText: "Continue planning", nonce: "newnonce", approvalMode: "ask", settings,
            reusedTurnContext: Promise.resolve(valid[0].metadata.turnContext), diagnostics });
        expect(next.turnContext).toBe(first.turnContext);
        expect(embedText).not.toHaveBeenCalled();
        expect(diagnostics.snapshot().phases.some((p) => ["profile", "embedding", "recall", "snapshot"].includes(p.name))).toBe(false);
        const schedule = await (next.agent.tools.get_schedule_window.execute as any)(
            { start: "2026-10-13", end: "2026-10-13", limit: 12 }, { toolCallId: "fresh", messages: [] });
        expect(schedule.range.timezone).toBe("Europe/Paris");
    });

    it("invalidates forgotten, edited, expired and other-user facts; additions preserve the stored prefix", async () => {
        await fact("constraint", "Keep Friday evenings free");
        const first = await prepare();
        const history = [{ id: "u1", role: "user", metadata: { turnContext: first.turnContext, other: "kept" } }];
        const validate = () => validateStoredContexts(history, true,
            (ids) => withRls(getTestDb(), userId, (tx) => loadContextFacts(tx, userId, ids, "2026-10-13")));
        await fact("life", "An unrelated new fact");
        expect((await validate())[0]).toBe(history[0]);
        const saved = await asOwner((pg) => pg.query<{ id: string }>("SELECT id FROM ai_memories WHERE user_id = $1 AND kind = 'constraint'", [userId]));
        const id = saved.rows[0].id;
        await asOwner((pg) => pg.query("UPDATE ai_memories SET content = 'Changed' WHERE id = $1", [id]));
        expect((await validate())[0].metadata).toEqual({ other: "kept" });
        await asOwner((pg) => pg.query("UPDATE ai_memories SET content = 'Keep Friday evenings free', valid_through = '2026-10-12' WHERE id = $1", [id]));
        expect((await validate())[0].metadata).toEqual({ other: "kept" });
        await asOwner((pg) => pg.query("UPDATE ai_memories SET valid_through = NULL WHERE id = $1", [id]));
        await withRls(getTestDb(), userId, (tx) => forgetFact(tx, userId, id));
        expect((await validate())[0].metadata).toEqual({ other: "kept" });
        const other = await createUser();
        const foreign = await validateStoredContexts(history, true,
            (ids) => withRls(getTestDb(), other, (tx) => loadContextFacts(tx, other, ids, "2026-10-13")));
        expect(foreign[0].metadata).toEqual({ other: "kept" });
        expect(history[0].metadata.turnContext).toBe(first.turnContext);
    });

    it("memory off invalidates stored memory without a fact read, and legacy continuation builds fresh context", async () => {
        await fact("constraint", "Keep Friday evenings free");
        const first = await prepare();
        const read = vi.fn();
        const history = [{ role: "user", metadata: { turnContext: first.turnContext } }];
        expect((await validateStoredContexts(history, false, read))[0].metadata).toEqual({});
        expect(read).not.toHaveBeenCalled();
        const off = { ...settings, assistant: { memoryMode: "off" as const } };
        const next = await getAgentInstance(env, userId, { timezone: "UTC", currentDate: now, nonce: "next",
            approvalMode: "full", settings: off, reusedTurnContext: Promise.resolve(undefined) });
        expect(next.turnContext).toContain("Memory is off");
        expect(next.turnContext).not.toContain("Keep Friday evenings free");
        expect(Object.keys(next.agent.tools)).not.toContain("recall");
        const onAgain = await validateStoredContexts([{ role: "user", metadata: { turnContext: next.turnContext } }], true, read);
        expect(onAgain[0].metadata).toEqual({});
    });

    it("shares the bounded routine rows, preserves snapshot output, and keeps subsequent tools fresh", async () => {
        await asOwner((pg) => pg.query(`INSERT INTO habits (user_id, title, recurrence_rule, target_time, created_at)
            VALUES ($1, 'Morning walk', 'FREQ=DAILY', '08:30', '2026-10-01T12:00:00Z')`, [userId]));
        await asOwner(async (pg) => {
            await pg.query(`INSERT INTO habits (user_id, title, recurrence_rule, times, created_at)
                VALUES ($1, 'Medicine', 'FREQ=DAILY', '["08:00","20:00"]', '2026-10-01T12:00:00Z')`, [userId]);
            await pg.query(`INSERT INTO habits (user_id, title, recurrence_rule, steps, created_at)
                VALUES ($1, 'Get ready', 'FREQ=DAILY', '[{"id":"step-1","title":"Brush teeth"},{"id":"step-2","title":"Get dressed"}]', '2026-10-01T12:00:00Z')`, [userId]);
            await pg.query(`INSERT INTO habit_logs (user_id, habit_id, target_date, status, step_status)
                SELECT $1, id, '2026-10-13', 'PENDING', '{"step-1":"COMPLETED"}' FROM habits WHERE user_id = $1 AND title = 'Get ready'`, [userId]);
            await pg.query(`INSERT INTO habits (user_id, title, recurrence_rule, paused_until, created_at)
                VALUES ($1, 'Paused', 'FREQ=DAILY', '2026-10-20', '2026-10-01T12:00:00Z')`, [userId]);
        });
        const clock = userClock("America/Toronto", now);
        const ctx = { timezone: clock.timezone, currentDate: now, today: clock.today };
        const tools = buildToolRegistry(env, userId, ctx);
        const events = { today: clock.today, shownOnCalendar: false, events: [] };
        const read = vi.spyOn(routineReads, "readSnapshotRoutines");
        const baseline = await loadSnapshot(tools, clock.today, events);
        expect(read).toHaveBeenCalledTimes(2);
        read.mockClear();
        const shared = await loadAgentSnapshot(env, userId, ctx, tools, events);
        expect(shared).toBe(baseline);
        const routines = JSON.parse(shared).routines;
        expect(routines.map((r: any) => r.title)).not.toContain("Paused");
        expect(routines.find((r: any) => r.title === "Medicine").times).toHaveLength(2);
        expect(routines.find((r: any) => r.title === "Get ready").steps[0].status).toBe("COMPLETED");
        expect(read).toHaveBeenCalledTimes(1);
        await asOwner((pg) => pg.query("UPDATE habits SET title = 'Evening walk' WHERE user_id = $1", [userId]));
        const fresh = await (tools.get_habit_status_today.execute as any)({}, { toolCallId: "fresh", messages: [] });
        expect(fresh.statuses[0].title).toBe("Evening walk");
        read.mockRestore();
    });

    it("retries a failed shared routine read and leaves unrelated snapshot sections available", async () => {
        const clock = userClock("America/Toronto", now);
        const ctx = { timezone: clock.timezone, currentDate: now, today: clock.today };
        const tools = buildToolRegistry(env, userId, ctx);
        const events = { today: clock.today, shownOnCalendar: false, events: [] };
        const original = routineReads.readSnapshotRoutines;
        const read = vi.spyOn(routineReads, "readSnapshotRoutines").mockImplementationOnce(() => { throw new Error("temporary read failure"); });
        const recovered = JSON.parse(await loadAgentSnapshot(env, userId, ctx, tools, events));
        expect(recovered).toHaveProperty("schedule");
        expect(recovered).toHaveProperty("routines");
        expect(read.mock.calls.length).toBeGreaterThan(1);
        read.mockImplementation(() => { throw new Error("read failure"); });
        const failed = JSON.parse(await loadAgentSnapshot(env, userId, ctx, tools, events));
        expect(failed).not.toHaveProperty("schedule");
        expect(failed).not.toHaveProperty("routines");
        expect(failed).toHaveProperty("overdue");
        expect(failed).toHaveProperty("capture");
        expect(failed.events).toEqual([]);
        read.mockImplementation(original); read.mockRestore();
    });

    it.skipIf(process.env.AI_PREPARATION_BENCHMARK !== "true")("compares 100 paired shared and independent snapshot preparations", async () => {
        const clock = userClock("America/Toronto", now);
        const ctx = { timezone: clock.timezone, currentDate: now, today: clock.today };
        const tools = buildToolRegistry(env, userId, ctx);
        const events = { today: clock.today, shownOnCalendar: false, events: [] };
        await asOwner((pg) => pg.query(`INSERT INTO habits (user_id, title, recurrence_rule, created_at)
            SELECT $1, 'Routine ' || i, 'FREQ=DAILY', '2026-10-01T12:00:00Z'::timestamptz FROM generate_series(1, 55) i`, [userId]));
        const samples: Record<string, number>[] = [];
        for (let i = 0; i < 100; i++) {
            const times: Record<string, number> = {};
            const outputs: string[] = [];
            for (const variant of i % 2 ? ["shared", "independent"] : ["independent", "shared"]) {
                const start = performance.now();
                outputs.push(await (variant === "shared" ? loadAgentSnapshot(env, userId, ctx, tools, events) : loadSnapshot(tools, clock.today, events)));
                times[variant] = performance.now() - start;
            }
            expect(outputs[0]).toBe(outputs[1]);
            samples.push(times);
        }
        const directory = join(__dirname, "../../output/evals");
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, "snapshot-preparation-parity.json"), JSON.stringify({
            evidence: "local PGlite; 100 alternating pairs; 55 routines; unchanged isolated transactions; not production latency", samples,
        }, null, 2));
    }, 60_000);

    it.skipIf(process.env.AI_PREPARATION_BENCHMARK !== "true")("preserves context across 100 paired covered and candidate-present preparations", async () => {
        await fact("constraint", "Keep Friday evenings free");
        const report: Record<string, unknown> = {};
        for (const cohort of ["covered", "candidates"]) {
            if (cohort === "candidates") await fact("pattern", "Afternoon gardening works best");
            const samples: { baselineMs: number; exactMs: number }[] = [];
            let baselineCalls = 0, exactCalls = 0;
            for (let i = 0; i < 100; i++) {
                const variants = i % 2 ? ["exact", "baseline"] : ["baseline", "exact"];
                const result: Record<string, Awaited<ReturnType<typeof prepare>>> = {};
                const times: Record<string, number> = {};
                for (const variant of variants) {
                    const before = vi.mocked(embedText).mock.calls.length;
                    const start = performance.now();
                    result[variant] = await prepare("Help with afternoon gardening", { AI_MEMORY_COVERAGE_GATE: variant === "exact" ? "true" : undefined });
                    times[variant] = performance.now() - start;
                    const calls = vi.mocked(embedText).mock.calls.length - before;
                    if (variant === "exact") exactCalls += calls; else baselineCalls += calls;
                }
                expect(result.exact.turnContext).toBe(result.baseline.turnContext);
                expect(Object.keys(result.exact.agent.tools)).toEqual(Object.keys(result.baseline.agent.tools));
                samples.push({ baselineMs: times.baseline, exactMs: times.exact });
            }
            expect(baselineCalls).toBe(100);
            expect(exactCalls).toBe(cohort === "covered" ? 0 : 100);
            report[cohort] = { pairs: 100, baselineCalls, exactCalls, samples };
        }
        const directory = join(__dirname, "../../output/evals");
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, "preparation-parity.json"), JSON.stringify({
            evidence: "local PGlite; mocked embedding failures; preparation only; not a production latency gate", ...report,
        }, null, 2));
    }, 60_000);
});
