/**
 * Assistant evals: the real agent (prompt, tools, model) against a real database,
 * from one-line adds to multi-step chains. Each scenario seeds its own user
 * through the tools, sends one or more turns in Full approval mode (writes run),
 * then checks the calls the model chained and the data they left behind.
 *
 * Costs model tokens, so it never runs with `pnpm test`: `pnpm eval:assistant`
 * (needs OPENROUTER_API_KEY in the environment or `.dev.vars`; AI_CHAT_MODEL
 * picks another model; iteration runs each scenario once; `pnpm eval:full`
 * restores repeated checks; `-t "<name>"` picks scenarios). Prints a summary with each scenario's
 * cached share and cost, and writes root `output/evals/assistant-<profile>.json`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { getAgentInstance } from "../../src/domains/ai/agent";
import { optimizationOptions } from "./optimization-options";
import { getModelId, pickChatModel } from "../../src/domains/ai/model-router";
import { buildToolRegistry } from "../../src/domains/ai/tools";
import { evaluationOptions, evaluationVars } from "./run-options";
import type { Env } from "../../src/types/env";
import { withRls } from "../../src/platform/rls";
import { habits } from "../../src/db/schema";
import { insertFact } from "../../src/domains/ai/memory/memory-store";
import { eq } from "drizzle-orm";
import { todayIn } from "@cadence/domain/time";

const TZ = "America/Toronto";
/** Wednesday 2026-09-23, 10:00 in Toronto. */
const NOW = "2026-09-23T14:00:00.000Z";
const TODAY = "2026-09-23";

/** `.dev.vars` values, for a local run without exported variables. */
const vars = evaluationVars();
const evaluation = evaluationOptions(vars);
const optimization = optimizationOptions(vars);
const reportName = vars.AI_EVAL_REPORT_NAME ?? `assistant-${evaluation.profile}`;
if (!/^[a-z0-9-]+$/i.test(reportName)) throw new Error("Invalid AI_EVAL_REPORT_NAME");
const variants = [optimization];
const env = { OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY, AI_CHAT_MODEL: vars.AI_CHAT_MODEL, AI_CHAT_MODEL_BASIC: vars.AI_CHAT_MODEL_BASIC ?? "deepseek/deepseek-v4.1-flash" } as unknown as Env;
/** Iteration defaults to one pass; full restores each scenario's repeat count. */
const maxRuns = evaluation.assistantRuns;

type Call = { step: number; name: string; input: any; output: any };
type Tools = ReturnType<typeof toolsFor> & { userId?: string };
interface Run { calls: Call[]; text: string; models: string[]; servedModels: string[]; steps: number; tokens: number; inputTokens: number; outputTokens: number; cached: number; written: number; cost: number; unknownCostSteps: number; failedRuns: number; ms: number }
interface Scenario {
    name: string;
    level: "simple" | "medium" | "complex";
    smoke?: boolean;
    memoryMode?: "basic" | "full";
    seed?: (t: Tools) => Promise<Record<string, any>>;
    turns: (string | { text: string; image: string })[];
    /** The user's clock for this scenario (default: NOW). */
    now?: string;
    /** Pick each turn's model with the router, as the chat route does (default: always the standard model). */
    routed?: boolean;
    /** Model runs to repeat, all of which must pass (luna is not deterministic; the time scenarios run 3). */
    runs?: number;
    /** Problems found, empty when it passed. */
    check: (run: Run, t: Tools, seeded: Record<string, any>) => Promise<string[]>;
}

/** Routines made by a seed exist from the start of the month, so past days count as due. */
const backdateRoutines = (userId: string) =>
    withRls(getTestDb(), userId, (tx: any) => tx.update(habits).set({ createdAt: "2026-09-01T12:00:00.000Z" }).where(eq(habits.userId, userId)));

function toolsFor(userId: string, now = NOW) {
    const tools = buildToolRegistry(env, userId, { timezone: TZ, currentDate: now, today: todayIn(TZ, new Date(now)), weekStart: "Monday" }) as any;
    let seq = 0;
    return async (name: string, input: object = {}) => {
        const result = await tools[name].execute(input, { toolCallId: `seed_${++seq}`, messages: [] });
        if (result?.ok === false) throw new Error(`${name}: ${result.error}`);
        return result;
    };
}

async function converse(userId: string, turns: Scenario["turns"], now = NOW, routed = false, variant = optimization): Promise<Run> {
    const calls: Call[] = [];
    const messages: any[] = [];
    let text = "";
    const models: string[] = [];
    const servedModels: string[] = [];
    let steps = 0;
    let tokens = 0, inputTokens = 0, outputTokens = 0, cached = 0, written = 0, cost = 0, unknownCostSteps = 0;
    const started = Date.now();
    for (const turn of turns) {
        const request = typeof turn === "string" ? turn : turn.text;
        const image = typeof turn === "string" ? null : readFileSync(join(__dirname, "../fixtures/ai", turn.image));
        // Like the chat route: the thread's model so far decides whether it may still go basic.
        const modelId = routed ? pickChatModel(env, { text: request, imageCount: image ? 1 : 0 }, models.at(-1)) : getModelId(env);
        // Like dropForeignReasoning: a model never replays another model's reasoning.
        if (models.length && models.at(-1) !== modelId) {
            for (const m of messages) if (m.role === "assistant" && Array.isArray(m.content)) m.content = m.content.filter((p: any) => p.type !== "reasoning");
        }
        models.push(modelId);
        const { agent, turnContext } = await getAgentInstance(env, userId, { ...variant, timezone: TZ, currentDate: now, approvalMode: "full", nonce: "evalnonce", modelId });
        // Like production: each user message keeps the context it was sent with, so later turns replay
        // it unchanged and read the earlier ones from the prompt cache.
        const textContent = `${request}\n\n${turnContext}`;
        messages.push({ role: "user", content: image ? [{ type: "file", data: image, mediaType: "image/png" }, { type: "text", text: textContent }] : textContent });
        const result = await agent.generate({ messages });
        for (const [i, step] of result.steps.entries()) {
            for (const call of step.toolCalls) {
                const output = step.toolResults.find((r: any) => r.toolCallId === call.toolCallId)?.output;
                calls.push({ step: steps + i, name: call.toolName, input: call.input, output });
            }
        }
        steps += result.steps.length;
        tokens += result.totalUsage?.totalTokens ?? 0;
        inputTokens += result.totalUsage?.inputTokens ?? 0;
        outputTokens += result.totalUsage?.outputTokens ?? 0;
        cached += result.totalUsage?.inputTokenDetails?.cacheReadTokens ?? 0;
        written += result.totalUsage?.inputTokenDetails?.cacheWriteTokens ?? 0;
        // What OpenRouter billed, per step.
        for (const step of result.steps) {
            servedModels.push(step.response.modelId ?? "unknown");
            const observed = (step.providerMetadata as any)?.openrouter?.usage?.cost;
            if (typeof observed === "number" && Number.isFinite(observed)) cost += observed;
            else unknownCostSteps++;
        }
        // A question asked with `ask_user` reads like one the reply typed: its question and options.
        const asked = calls.filter((c) => c.name === "ask_user" && c.step >= steps - result.steps.length)
            .map((c) => `${c.input?.question ?? ""} ${(c.input?.options ?? []).map((o: any) => o.label).join(" / ")}`);
        text = [result.text, ...asked].filter(Boolean).join("\n");
        // Every step's calls and results, as production replays them from the stored parts: in ai v7
        // `result.response.messages` is the last step only, which left later turns without the ids.
        messages.push(...result.steps.flatMap((step) => step.response.messages));
    }
    return { calls, text, models, servedModels, steps, tokens, inputTokens, outputTokens, cached, written, cost, unknownCostSteps, failedRuns: 0, ms: Date.now() - started };
}

// ── Checks ──────────────────────────────────────────────────────────────────
const called = (run: Run, name: string) => run.calls.filter((c) => c.name === name);
const failedCalls = (run: Run) => run.calls.filter((c) => c.output?.ok === false).map((c) => `${c.name} failed: ${c.output.error}`);
const need = (ok: boolean, problem: string) => (ok ? [] : [problem]);
/** Reads that could have gone together but came one step after another. */
function serialReads(run: Run) {
    const readSteps = [...new Set(run.calls.filter((c) => c.name.startsWith("get_")).map((c) => c.step))];
    return readSteps.length;
}
const openTasks = async (t: Tools, input: object = {}) => (await t("get_tasks", { limit: 50, ...input })).tasks as any[];
const titled = (rows: any[], title: string) => rows.find((row) => row.title.toLowerCase().includes(title.toLowerCase()));

async function seedVersionTasks(t: Tools) {
    const { projectId, sections } = await t("create_project", { name: "CS App Projects", sections: ["Cadence"] });
    const { created } = await t("create_tasks", { tasks: [
        { title: "Implement 0.31.0" },
        { title: "Implement 0.32.0" },
        { title: "Implement 0.31.01" },
        { title: "Implement 0.32.0-rc1" },
        { title: "Release retrospective", note: "Look back at 0.31.0" },
        { title: "Buy groceries" },
    ].map((task) => ({ ...task, projectId, sectionId: sections[0].sectionId })) });
    return { targets: created.slice(0, 2).map((task: any) => task.taskId), projectId, sectionId: sections[0].sectionId };
}

const SCENARIOS: Scenario[] = [
    ...(["basic", "full"] as const).map((memoryMode): Scenario => ({
        name: `production-shaped thread: routine writes then scheduling with ${memoryMode} memory`,
        level: "complex",
        memoryMode,
        seed: async (t) => {
            await t("create_habit", { title: "Workout", recurrenceRule: "FREQ=DAILY" });
            await t("create_habit", { title: "Yoga", recurrenceRule: "FREQ=DAILY" });
            await t("create_habit", { title: "Log calories", recurrenceRule: "FREQ=DAILY", times: ["22:00"] });
            await backdateRoutines(t.userId!);
            await withRls(getTestDb(), t.userId!, async (tx) => {
                for (const content of ["Prefers concise replies", "Studies computer science", "Keeps study notes in course lists", "Exam is on Friday morning"]) {
                    await insertFact(tx, t.userId!, { kind: "life", content, saidOn: "2026-09-01", source: "chat", confidence: "stated" });
                }
            });
            return {};
        },
        turns: ["I finished Workout.", "What else do I have today?", "Yoga is finished too.", "I need to turn in my watch for trade-in on Friday after my exam."],
        check: async (run, t) => {
            const statuses = (await t("get_habit_status_today")).statuses as any[];
            const completed = statuses.filter((s) => /Workout|Yoga/.test(s.title));
            const tasks = await openTasks(t);
            const watch = tasks.find((task) => /watch|trade/i.test(task.title));
            return [
                ...need(completed.length === 2 && completed.every((s) => s.status === "COMPLETED"), "both requested routines logged"),
                ...need(tasks.length === 1 && watch?.dueDate === "2026-09-25", "one trade-in task on Friday"),
                ...need(called(run, "create_tasks").length === 1 && called(run, "log_habit").length === 2, "writes executed once without duplicates"),
                ...need(!called(run, "remember").length, "passing request is not an explicit memory save"),
            ];
        },
    })),
    {
        name: "note: read version and preserve unrequested lines",
        level: "medium",
        seed: async (t) => t("create_tasks", { tasks: [{ title: "Trip checklist", note: "Passport: ready\nFlight: pending\nHotel: booked" }] }),
        turns: ["In my Trip checklist note, change only 'Flight: pending' to 'Flight: booked'."],
        check: async (run, t) => {
            const [task] = await openTasks(t);
            const detail = await t("get_task_detail", { taskId: task.id });
            const read = called(run, "get_task_detail")[0];
            const write = called(run, "update_tasks")[0];
            return [
                ...need(!!read && !!write && read.step < write.step, "note read before its update"),
                ...need(write?.input.patch.noteVersion === read?.output.note.version, "read note version accompanies write"),
                ...need(detail.note.text.includes("Passport: ready\nFlight: booked\nHotel: booked"), "unrequested lines preserved"),
            ];
        },
    },
    {
        name: "image: deadline, evidence and empty section; retain image for a later question",
        level: "complex",
        runs: 3,
        seed: async (t) => t("create_project", { name: "University", sections: ["COMP2000", "COMP3005"] }),
        turns: [{ text: "Add this university assignment where it belongs, using the details shown.", image: "p2-assignment.png" }, "What deadline time did that image give?"],
        check: async (run, t, seeded) => {
            const rows = await openTasks(t);
            const task = rows[0];
            const detail = task ? await t("get_task_detail", { taskId: task.id }) : null;
            const create = called(run, "create_tasks");
            return [
                ...need(rows.length === 1, "one assignment, not separate tasks for its steps"),
                ...need(task?.projectId === seeded.projectId && task?.sectionId === seeded.sections[0].sectionId, "placed in the named empty section"),
                ...need(task?.dueDate === "2026-10-20" && !task?.scheduledStart, "deadline is a day, not a scheduled block"),
                ...need(task?.priority === 3, "visible High priority saved"),
                ...need(/11:59|23:59/.test(detail?.note?.text ?? ""), "visible deadline time preserved in note"),
                ...need(detail?.subtasks.length === 2 && detail.subtasks.every((s: any) => !/read brief/i.test(s.title)), "only the two unchecked steps saved"),
                ...need(create.length === 1 && JSON.stringify(create[0]?.input).includes("fromImage"), "image evidence accompanies the write, with no duplicate task"),
                ...need(/11:59|23:59/.test(run.text), "later question can still inspect the original image"),
            ];
        },
    },
    {
        name: "task search: complete two loosely named tasks without identifiers",
        level: "medium",
        seed: async (t) => {
            const { created } = await t("create_tasks", { tasks: [
                { title: "Renew passport" }, { title: "Book dentist" }, { title: "Book flight" },
            ] });
            return { targets: created.slice(0, 2).map((task: any) => task.taskId) };
        },
        turns: ["finished the passport renewal and dentist booking"],
        check: async (run, t, { targets }) => {
            const done = (await t("get_tasks", { state: "COMPLETE" })).tasks.map((task: any) => task.id).sort();
            return [
                ...need(JSON.stringify(done) === JSON.stringify([...targets].sort()), "only passport and dentist marked done"),
                ...need(called(run, "ask_user").length === 0, "no clarification for clear word-form matches"),
                ...need(called(run, "create_tasks").length === 0, "no replacements created"),
            ];
        },
    },
    {
        name: "version search: complete two releases after an unrelated overdue question",
        level: "medium",
        runs: 3,
        seed: seedVersionTasks,
        turns: ["What's overdue?", "finished implementation of 0.31.0 and 0.32.0"],
        check: async (run, t, { targets }) => {
            const done = (await t("get_tasks", { state: "COMPLETE", limit: 50 })).tasks.map((task: any) => task.id).sort();
            return [
                ...need(JSON.stringify(done) === JSON.stringify([...targets].sort()), "only the two exact releases marked done"),
                ...need(called(run, "ask_user").length === 0, "no clarification for unique title matches"),
                ...need(called(run, "create_tasks").length === 0, "no invented replacement tasks"),
            ];
        },
    },
    {
        name: "version search: missing release never becomes a nearby version",
        level: "medium",
        runs: 3,
        seed: seedVersionTasks,
        turns: ["finished implementation of 0.33.0"],
        check: async (run, t) => [
            ...need(!(await t("get_tasks", { state: "COMPLETE" })).tasks.length, "no other version marked done"),
            ...need(called(run, "create_tasks").length === 0, "no invented replacement tasks"),
            ...need(called(run, "get_tasks").some((call) => call.input.query?.includes("0.33.0")), "searched the actual identifier"),
        ],
    },
    {
        name: "version search: duplicate identifiers need clarification",
        smoke: true,
        level: "medium",
        runs: 3,
        seed: async (t) => {
            const seeded = await seedVersionTasks(t);
            const { projectId } = await t("create_project", { name: "Another app" });
            await t("create_tasks", { tasks: [{ title: "Implement 0.31.0", projectId }] });
            return seeded;
        },
        turns: ["finished implementation of 0.31.0"],
        check: async (run, t) => [
            ...need(!(await t("get_tasks", { state: "COMPLETE" })).tasks.length, "no duplicate picked without evidence"),
            ...need(called(run, "ask_user").length === 1, "asks which app"),
        ],
    },
    {
        name: "add a timed task",
        smoke: true,
        level: "simple",
        turns: ["add call mom tomorrow at 6pm"],
        check: async (run, t) => {
            const task = titled(await openTasks(t), "mom");
            return [
                ...need(called(run, "create_tasks").length === 1, "one create_tasks"),
                ...need(!run.calls.some((c) => c.name.startsWith("get_")), "no read needed for a plain add"),
                ...need(task?.scheduledStart === "2026-09-24T18:00:00-04:00", `timed tomorrow 6 PM (got ${task?.scheduledStart})`),
            ];
        },
    },
    {
        name: "tag by name, making the tag",
        level: "simple",
        turns: ["add renew passport and tag it errands"],
        check: async (run, t) => {
            const [tag] = (await t("get_tags", { query: "errand" })).tags;
            const task = titled(await openTasks(t), "passport");
            return [
                ...need(!!tag && task?.tags?.includes(tag.name), "task carries an errands tag"),
                ...need(called(run, "create_tag").length === 0, "tagged by name instead of create_tag first"),
                ...need(run.steps <= 2, `≤2 steps (took ${run.steps})`),
            ];
        },
    },
    {
        name: "reminder at a time",
        level: "simple",
        turns: ["remind me to take the bins out at 7pm tonight"],
        check: async (_run, t) => {
            const task = titled(await openTasks(t), "bin");
            return need(task?.reminderAt === "2026-09-23T19:00:00-04:00", `reminder at 7 PM today (got ${task?.reminderAt})`);
        },
    },
    {
        name: "deadline with a time keeps the time",
        level: "simple",
        runs: 3,
        turns: ["I have a lab due October 20 at 23:59, note that for me"],
        check: async (run, t) => {
            const task = titled(await openTasks(t), "lab");
            const detail = task && (await t("get_task_detail", { taskId: task.id }));
            return [
                ...need(task?.dueDate === "2026-10-20" && !task?.scheduledStart, `due Oct 20, not timed (got ${task?.dueDate} / ${task?.scheduledStart})`),
                ...need(/23:59|11:59/.test(detail?.note?.text ?? ""), `time kept in the note (got "${detail?.note?.text}")`),
                ...need(!/lab.*(23|11):59/i.test(task?.title ?? ""), "time stays out of the title"),
            ];
        },
    },
    {
        name: "find tasks by tag past the first page",
        level: "medium",
        seed: async (t) => {
            await t("create_tasks", { tasks: Array.from({ length: 20 }, (_, i) => ({ title: `Filler ${i}` })) });
            await t("create_tasks", { tasks: Array.from({ length: 20 }, (_, i) => ({ title: `Filler B${i}` })) });
            await t("create_tasks", { tasks: [
                { title: "Draft thesis intro", tagNames: ["Deep Work"] },
                { title: "Refactor billing", tagNames: ["Deep Work"] },
                { title: "Write grant", tagNames: ["Deep Work"] },
            ] });
            return {};
        },
        turns: ["what's tagged deep work?"],
        check: async (run) => [
            ...need(called(run, "get_tasks").some((c) => c.input.tagId), "get_tasks filtered by tagId"),
            ...need(["thesis", "billing", "grant"].every((w) => run.text.toLowerCase().includes(w)), "answer names all three"),
        ],
    },
    {
        name: "clear a day, leaving Fixed and deadlines",
        level: "medium",
        seed: async (t) => {
            const { created } = await t("create_tasks", { tasks: [
                { title: "Laundry", dueDate: "2026-09-25", priority: 0 },
                { title: "Call plumber", dueDate: "2026-09-25", priority: 1 },
                { title: "Read chapter 4", scheduledStart: "2026-09-25T15:00:00-04:00", scheduledEnd: "2026-09-25T16:00:00-04:00" },
                { title: "Chem lab", scheduledStart: "2026-09-25T09:00:00-04:00", scheduledEnd: "2026-09-25T11:00:00-04:00", fixed: true },
            ] });
            return { ids: created.map((c: any) => c.taskId) };
        },
        turns: ["clear my friday please"],
        check: async (run, t, { ids }) => {
            const friday = (await t("get_schedule_window", { start: "2026-09-25", end: "2026-09-25" })).tasks as any[];
            return [
                ...need(called(run, "reschedule_tasks").length >= 1, "rescheduled"),
                ...need(friday.some((task) => task.id === ids[3]), "Fixed class stays"),
                ...need(!friday.some((task) => [ids[0], ids[1], ids[2]].includes(task.id)), `movable tasks left Friday (left: ${friday.map((f) => f.title)})`),
                ...need(run.steps <= 4, `≤4 steps (took ${run.steps})`),
            ];
        },
    },
    {
        name: "overdue triage in one pass",
        level: "medium",
        seed: async (t) => {
            await t("create_tasks", { tasks: ["Submit expenses", "Email Jo", "Old idea", "Book dentist", "Pay fine"].map((title, i) => ({ title, dueDate: `2026-09-${String(15 + i).padStart(2, "0")}` })) });
            return {};
        },
        turns: ["my overdue stuff: expenses and the email to Jo are done, drop the old idea, move the rest to next monday"],
        check: async (run, t) => {
            const rows = await t("get_tasks", { state: "COMPLETE", limit: 50 });
            const trash = await t("get_tasks", { state: "ARCHIVED", limit: 50 });
            const open = await openTasks(t);
            return [
                ...need(["expenses", "jo"].every((w) => titled(rows.tasks, w)), "two done"),
                ...need(!!titled(trash.tasks, "old idea"), "old idea in Trash"),
                ...need(["dentist", "fine"].every((w) => titled(open, w)?.dueDate === "2026-09-28"), "rest on Monday 28th"),
                ...need(called(run, "set_task_state").length <= 2 && called(run, "reschedule_tasks").length === 1, "batched: ≤2 state calls, 1 reschedule"),
            ];
        },
    },
    {
        name: "sort Capture in batches",
        level: "medium",
        seed: async (t) => {
            for (const rawText of ["buy printer ink", "call the bank about the card", "idea: a newsletter about tide pools", "book flights for december", "renew car insurance"]) {
                await t("capture_to_inbox", { rawText });
            }
            return {};
        },
        turns: ["sort my capture. keep the newsletter idea as a note, the rest are tasks"],
        check: async (run, t) => {
            const items = (await t("get_inbox_items", {})).items as any[];
            const structured = called(run, "create_tasks");
            return [
                ...need(structured.length === 1 && structured[0].input.tasks.filter((d: any) => d.inboxItemId).length === 4, `one create_tasks with 4 captures (got ${structured.map((c) => c.input.tasks.length)})`),
                ...need(items.length === 1 && items[0].isNote, "only the note is left, kept as a note"),
            ];
        },
    },
    {
        name: "new list with sections, then its tasks",
        level: "complex",
        turns: ["plan my move: make a list called Move with sections Packing and Admin. add book movers and change address under admin, buy boxes under packing"],
        check: async (run, t) => {
            const [list] = (await t("get_projects", { query: "move" })).projects;
            const tasks = list ? await openTasks(t, { projectId: list.id }) : [];
            const section = (name: string) => list?.sections.find((s: any) => s.name === name)?.id;
            return [
                ...need(!!list && list.sections.length === 2, "list with 2 sections"),
                ...need(called(run, "create_sections").length === 0, "sections made with the list"),
                ...need(called(run, "create_tasks").length === 1, "one create_tasks"),
                ...need(titled(tasks, "movers")?.sectionId === section("Admin") && titled(tasks, "boxes")?.sectionId === section("Packing"), "tasks in their sections"),
            ];
        },
    },
    {
        name: "deleting a list asks what happens to its tasks",
        level: "medium",
        seed: async (t) => {
            const { projectId } = await t("create_project", { name: "Old stuff" });
            await t("create_tasks", { tasks: [{ title: "Keep this?", projectId }] });
            return {};
        },
        turns: ["delete my old stuff list"],
        check: async (run) => need(called(run, "delete_project").length === 0 && called(run, "ask_user").length === 1, "asks first with ask_user (keep or trash its tasks)"),
    },
    {
        name: "merge two tags",
        level: "complex",
        seed: async (t) => {
            await t("create_tasks", { tasks: [{ title: "Quarterly report", tagNames: ["work"] }, { title: "Team sync", tagNames: ["work"] }, { title: "Onboard Sam", tagNames: ["job"] }] });
            return {};
        },
        turns: ["merge my work tag into job"],
        check: async (run, t) => {
            const tags = (await t("get_tags", {})).tags as any[];
            const job = tags.find((tag) => tag.name === "job");
            const tasks = await openTasks(t);
            return [
                ...need(!tags.some((tag) => tag.name === "work"), "work tag deleted"),
                ...need(!!job && tasks.every((task) => task.tags?.includes(job.name)), "every task now tagged job"),
                ...failedCalls(run),
            ];
        },
    },
    {
        name: "show a saved focus view",
        level: "medium",
        seed: async (t) => {
            await t("create_tasks", { tasks: [{ title: "Quick email", effort: 1 }, { title: "Big migration", effort: 3 }] });
            await t("save_focus_view", { name: "Quick wins", filters: { effortMax: 1 } });
            return {};
        },
        turns: ["what's in my quick wins view?"],
        check: async (run) => [
            ...need(called(run, "get_tasks").some((c) => c.input.focusViewId), "get_tasks with focusViewId"),
            ...need(/quick email/i.test(run.text) && !/big migration/i.test(run.text), "lists only the matching task"),
        ],
    },
    {
        name: "undo the last change",
        smoke: true,
        level: "complex",
        seed: async (t) => {
            await t("create_tasks", { tasks: [{ title: "Water plants", dueDate: TODAY }, { title: "Stretch", dueDate: TODAY }] });
            return {};
        },
        turns: ["move everything from today to tomorrow", "actually undo that"],
        check: async (run, t) => {
            const today = await openTasks(t, { dueWindow: "today" });
            return [
                ...need(called(run, "reschedule_tasks").length >= 2, "moved, then moved back"),
                ...need(["water", "stretch"].every((w) => titled(today, w)), "both back on today"),
            ];
        },
    },
    {
        name: "routine order and permanent delete",
        level: "medium",
        seed: async (t) => {
            for (const title of ["Meditate", "Journal", "Read"]) await t("create_habit", { title, recurrenceRule: "FREQ=DAILY" });
            return {};
        },
        turns: ["delete my meditate routine for good, and move read to the top of my routines"],
        check: async (run, t) => {
            const titles = ((await t("get_habits", { includeArchived: true })).habits as any[]).map((h) => h.title);
            return [
                ...need(called(run, "delete_habit").length === 1, "delete_habit"),
                ...need(JSON.stringify(titles) === JSON.stringify(["Read", "Journal"]), `Read first, Meditate gone (got ${titles})`),
            ];
        },
    },
    {
        name: "set times: one medication routine",
        level: "simple",
        runs: 3,
        turns: ["I need a proper medication routine, I take it at 9am, 3pm and 9pm"],
        check: async (run, t) => {
            const routines = (await t("get_habits", {})).habits as any[];
            return [
                ...need(routines.length === 1, `one routine (got ${routines.map((h) => h.title)})`),
                ...need(JSON.stringify(routines[0]?.times) === JSON.stringify(["09:00", "15:00", "21:00"]), `times 09:00, 15:00, 21:00 (got ${JSON.stringify(routines[0]?.times)})`),
                ...need(called(run, "create_tasks").length === 0, "no tasks"),
            ];
        },
    },
    {
        name: "set times: log the dose they name",
        smoke: true,
        level: "simple",
        runs: 3,
        seed: async (t) => t("create_habit", { title: "Pills", recurrenceRule: "FREQ=DAILY", times: ["07:30", "12:30", "19:30"] }),
        turns: ["took my 7:30 pills"],
        check: async (run, t) => {
            const pills = ((await t("get_habit_status_today", {})).statuses as any[])[0];
            const done = (pills?.times ?? []).filter((x: any) => x.status === "COMPLETED").map((x: any) => x.time);
            return [
                ...need(JSON.stringify(done) === JSON.stringify(["07:30"]), `only 07:30 done (got ${JSON.stringify(done)})`),
                ...need(/7:30/.test(run.text), "says which time it marked"),
            ];
        },
    },
    {
        name: "set times: a plain done near a dose takes it",
        level: "simple",
        runs: 3,
        // 10:00 in Toronto: 9:30 is clearly the one.
        seed: async (t) => t("create_habit", { title: "Pills", recurrenceRule: "FREQ=DAILY", times: ["09:30", "15:00", "21:00"] }),
        turns: ["took my pills"],
        check: async (run, t) => {
            const pills = ((await t("get_habit_status_today", {})).statuses as any[])[0];
            const done = (pills?.times ?? []).filter((x: any) => x.status === "COMPLETED").map((x: any) => x.time);
            return need(JSON.stringify(done) === JSON.stringify(["09:30"]), `only 09:30 done (got ${JSON.stringify(done)})`);
        },
    },
    {
        name: "set times: between doses, ask which",
        level: "simple",
        runs: 3,
        // 10:00 in Toronto: three hours from 7:00 and from 13:00.
        seed: async (t) => t("create_habit", { title: "Pills", recurrenceRule: "FREQ=DAILY", times: ["07:00", "13:00", "19:00"] }),
        turns: ["took my pills"],
        check: async (run, t) => {
            const pills = ((await t("get_habit_status_today", {})).statuses as any[])[0];
            const done = (pills?.times ?? []).filter((x: any) => x.status === "COMPLETED");
            return [
                ...need(done.length === 0, `marks nothing yet (got ${JSON.stringify(done)})`),
                ...need(called(run, "ask_user").length === 1, "asks with ask_user"),
                ...need(/\?/.test(run.text) && /7(:00)?\s*(am|AM)|13:00|1(:00)?\s*(pm|PM)/.test(run.text), "asks which, naming the times"),
            ];
        },
    },
    {
        name: "which routines were missed (no guessing from streaks)",
        level: "medium",
        seed: async (t) => {
            const [calories, anki, workout] = [
                await t("create_habit", { title: "Log calories", recurrenceRule: "FREQ=DAILY", targetTime: "22:00" }),
                await t("create_habit", { title: "French ANKI", recurrenceRule: "FREQ=DAILY" }),
                await t("create_habit", { title: "Workout", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,TH,FR" }),
            ];
            await backdateRoutines(t.userId!);
            // Streaks look healthy: days done before the two asked about.
            for (const day of ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]) {
                await t("log_habit", { habitId: calories.habitId, status: "COMPLETED", targetDate: day });
                await t("log_habit", { habitId: anki.habitId, status: "COMPLETED", targetDate: day });
            }
            await t("log_habit", { habitId: calories.habitId, status: "COMPLETED", targetDate: "2026-09-21" });
            for (const day of ["2026-09-21", "2026-09-22"]) await t("log_habit", { habitId: workout.habitId, status: "COMPLETED", targetDate: day });
            return {};
        },
        turns: ["Habits that I missed yesterday and day before?"],
        check: async (run) => {
            const text = run.text.toLowerCase();
            return [
                ...need(called(run, "get_habit_history").some((c) => c.input.start <= "2026-09-21" && c.input.end >= "2026-09-22"), "read history for Mon–Tue"),
                ...need(text.includes("anki") && text.includes("calories"), "names French ANKI (both days) and Log calories (yesterday)"),
                ...need(!/didn.t miss any|no missed|none missed|nothing missed/.test(text), "doesn't claim nothing was missed"),
            ];
        },
    },
    {
        name: "put a task at the top of its list",
        level: "simple",
        seed: async (t) => {
            const { projectId } = await t("create_project", { name: "Home" });
            await t("create_tasks", { tasks: ["Fix shelf", "Clean oven", "Pay rent"].map((title) => ({ title, projectId })) });
            return { projectId };
        },
        turns: ["put pay rent at the top of my home list"],
        check: async (run, t, { projectId }) => {
            const [first] = await openTasks(t, { projectId, sort: "list" });
            return [...need(called(run, "reorder_tasks").length === 1, "reorder_tasks"), ...need(/rent/i.test(first?.title), `Pay rent first (got ${first?.title})`)];
        },
    },
    {
        name: "check off a half-remembered task by its section",
        level: "medium",
        seed: async (t) => {
            const { projectId, sections } = await t("create_project", { name: "University", sections: ["COMP3005", "COMP2000"] });
            const { created } = await t("create_tasks", { tasks: [
                { title: "Assignment 1", dueDate: TODAY, projectId, sectionId: sections[0].sectionId, subtasks: ["Question 1", "Question 2"] },
                { title: "Assignment 1", dueDate: "2026-09-30", projectId, sectionId: sections[1].sectionId },
                { title: "Read chapter 3", dueDate: TODAY },
            ] });
            return { target: created[0].taskId, decoy: created[1].taskId };
        },
        // No title holds "comp"; the section does. "yesterday" is wrong: it's due today.
        turns: ["finished my comp assignment that was due yesterday i think"],
        check: async (run, t, { target, decoy }) => {
            const done = (await t("get_tasks", { state: "COMPLETE" })).tasks as any[];
            return [
                ...need(done.some((task) => task.id === target), "COMP3005 Assignment 1 marked done"),
                ...need(!done.some((task) => task.id === decoy), "COMP2000 Assignment 1 left open"),
                // A wrong day ("yesterday") earns one search before the pick.
                ...need(run.steps <= 4, `≤4 steps (took ${run.steps})`),
                ...failedCalls(run).filter((p) => p.startsWith("get_")),
            ];
        },
    },
    {
        name: "two candidates: ask, don't guess",
        level: "medium",
        seed: async (t) => {
            const { projectId, sections } = await t("create_project", { name: "University", sections: ["COMP3005", "COMP2000"] });
            await t("create_tasks", { tasks: sections.map((s: { sectionId: string }) => ({ title: "Assignment 1", dueDate: TODAY, projectId, sectionId: s.sectionId })) });
            return {};
        },
        turns: ["done with the comp assignment due today"],
        check: async (run, t) => [
            // A held set_task_state changes nothing, so check the data, not the calls.
            ...need(!(await t("get_tasks", { state: "COMPLETE" })).tasks.length, "nothing marked done on a guess"),
            ...need(called(run, "ask_user").length === 1 && /3005/.test(run.text) && /2000/.test(run.text), "asks which with ask_user, naming both sections"),
        ],
    },
    {
        name: "ask, then act on the answer",
        level: "medium",
        runs: 3,
        seed: async (t) => {
            const { projectId, sections } = await t("create_project", { name: "University", sections: ["COMP3005", "COMP2000"] });
            await t("create_tasks", { tasks: sections.map((s: { sectionId: string }) => ({ title: "Assignment 1", dueDate: TODAY, projectId, sectionId: s.sectionId })) });
            return {};
        },
        turns: ["done with the comp assignment due today", "COMP2000"],
        check: async (run, t) => {
            const done = (await t("get_tasks", { state: "COMPLETE" })).tasks as any[];
            return [
                ...need(called(run, "ask_user").length === 1, "asked once with ask_user"),
                ...need(done.length === 1 && /2000/.test(done[0].section ?? ""), `marks only the COMP2000 one (got ${done.map((d) => d.section)})`),
            ];
        },
    },
    {
        name: "rebalance an overloaded week",
        level: "complex",
        seed: async (t) => {
            await t("create_tasks", { tasks: Array.from({ length: 9 }, (_, i) => ({ title: `Thursday thing ${i + 1}`, dueDate: "2026-09-24", priority: i % 3 })) });
            await t("create_tasks", { tasks: [{ title: "Report due", dueDate: "2026-09-24", priority: 4 }] });
            return {};
        },
        turns: ["this week is way too much, especially thursday. spread things out for me"],
        check: async (run, t) => {
            const thursday = (await t("get_schedule_window", { start: "2026-09-24", end: "2026-09-24" })).tasks as any[];
            return [
                ...need(called(run, "get_schedule_window").length >= 1, "read the week"),
                ...need(thursday.length <= 6, `Thursday lighter (has ${thursday.length})`),
                ...need(thursday.some((task) => /report/i.test(task.title)), "the urgent deadline stays"),
                ...need(serialReads(run) <= 2, `reads grouped (${serialReads(run)} read steps)`),
            ];
        },
    },
    // ── Time model (0.26.3): a deadline is a day; a time means a timed block or a reminder ──
    {
        name: "deadline with a time is a day plus a reminder",
        level: "simple",
        runs: 3,
        turns: ["Add the essay, due Friday at 11:59 PM"],
        check: async (run, t) => {
            const essay = titled(await openTasks(t), "essay");
            const rejected = called(run, "create_tasks").filter((c) => c.output?.ok === false);
            return [
                ...need(essay?.dueDate === "2026-09-25", `dueDate is Friday's day, no time (got ${essay?.dueDate})`),
                ...need(!essay?.scheduledStart, `no timed block for a deadline (got ${essay?.scheduledStart})`),
                ...need(!essay?.reminderAt || essay.reminderAt.startsWith("2026-09-25"), `a reminder, if any, is Friday (got ${essay?.reminderAt})`),
                ...need(rejected.length === 0, "dueDate sent as a day the first time, not a time that the schema refused"),
            ];
        },
    },
    {
        name: "what's due today, at 11:30 PM",
        level: "simple",
        runs: 3,
        now: "2026-09-24T03:30:00.000Z", // 11:30 PM Wednesday 2026-09-23 in Toronto, already Thursday in UTC
        seed: async (t) => {
            await t("create_tasks", { tasks: [{ title: "COMP3000 assignment", dueDate: "2026-09-23" }, { title: "Tomorrow thing", dueDate: "2026-09-24" }] });
            return {};
        },
        turns: ["What's due today?"],
        check: async (run, t) => [
            ...need(/COMP3000/i.test(run.text), "names the all-day task due today"),
            ...need(!/Tomorrow thing/i.test(run.text), "leaves tomorrow's task out"),
            ...need(!/COMP3000[^.]*overdue|overdue[^.]*COMP3000/i.test(run.text), "doesn't call today's task overdue"),
            ...need(run.calls.every((c) => c.name.startsWith("get_")), "reads only"),
            ...need((await openTasks(t)).length === 2, "nothing changed"),
        ],
    },
    {
        name: "move a class across the DST change",
        level: "medium",
        runs: 3,
        now: "2026-10-30T14:00:00.000Z", // Friday 10:00 AM EDT; clocks go back on Sunday 2026-11-01
        seed: async (t) => {
            await t("create_tasks", { tasks: [{ title: "COMP3005 class", scheduledStart: "2026-10-30T14:35:00-04:00", scheduledEnd: "2026-10-30T15:55:00-04:00" }] });
            return {};
        },
        turns: ["Move my COMP3005 class to Monday"],
        check: async (run, t) => {
            const klass = titled(await openTasks(t), "COMP3005");
            return [
                ...need(klass?.scheduledStart === "2026-11-02T14:35:00-05:00", `Monday, same local time 2:35 PM (got ${klass?.scheduledStart})`),
                ...need(klass?.scheduledEnd === "2026-11-02T15:55:00-05:00", `ends 3:55 PM (got ${klass?.scheduledEnd})`),
                ...need(called(run, "reschedule_tasks").length + called(run, "update_tasks").length >= 1, "moved with a write"),
            ];
        },
    },
    {
        name: "a weekly class across the DST change",
        level: "medium",
        runs: 3,
        now: "2026-10-26T14:00:00.000Z",
        seed: async (t) => {
            await t("create_tasks", { tasks: [{
                title: "COMP3005 lecture", scheduledStart: "2026-10-29T14:35:00-04:00", scheduledEnd: "2026-10-29T15:55:00-04:00",
                recurrenceRule: "FREQ=WEEKLY;BYDAY=TH", fixed: true,
            }] });
            return {};
        },
        turns: ["What time is my COMP3005 lecture on Thursday Oct 29 and on Thursday Nov 5?"],
        check: async (run) => [
            ...need(called(run, "get_schedule_window").length >= 1, "read the schedule window"),
            ...need(/2:35|14:35/.test(run.text), "says 2:35 PM"),
            ...need(!/1:35|3:35/.test(run.text), "never shifts the time an hour"),
            ...need(run.calls.every((c) => c.name.startsWith("get_")), "reads only"),
        ],
    },
    {
        // 0.37.0 H: Find a time reads the calendar and proposes; placing is a separate, approved write.
        name: "find a time tomorrow uses find_time and writes nothing unasked",
        level: "medium",
        runs: 3,
        seed: async (t) => {
            await t("create_tasks", { tasks: [{ title: "Lab report", durationEstimate: 45 }, { title: "Class", scheduledStart: "2026-09-24T09:00:00-04:00", scheduledEnd: "2026-09-24T10:30:00-04:00", fixed: true }] });
            return {};
        },
        turns: ["Find me a time for the lab report tomorrow."],
        check: async (run, t) => {
            const tasks = await openTasks(t);
            const lab = titled(tasks, "lab report");
            const found = called(run, "find_time")[0];
            return [
                ...need(!!found, "looked with find_time"),
                ...need(found?.output?.proposals?.length > 0, "found a gap to offer"),
                ...need(!!lab && !lab.scheduledStart && !called(run, "update_tasks").length && !called(run, "reschedule_tasks").length, "placed nothing: a proposal is not a decision"),
                ...need(/gap|free|open|fits|available/i.test(run.text), "calls them gaps in the calendar, not known free time"),
                ...need(!/you usually|energy|best time for you/i.test(run.text), "no claims about the person"),
            ];
        },
    },
    {
        name: "when do I usually study: answers from the pattern as a choice, not an energy claim",
        level: "medium",
        runs: 3,
        memoryMode: "full",
        seed: async (t) => {
            await withRls(getTestDb(), t.userId!, async (tx) => {
                await insertFact(tx, t.userId!, { kind: "pattern", key: "pattern|slot|all|evening", content: "Often plans study in the evening (12 choices since August)", saidOn: "2026-09-20", source: "activity", confidence: "observed" });
            });
            return {};
        },
        turns: ["When do I usually study?"],
        check: async (run) => [
            ...need(/evening/i.test(run.text), "names the evening, from the fact"),
            ...need(!/energy|productive|focus is best|your brain/i.test(run.text), "a choice, never an energy claim"),
            ...need(!called(run, "update_tasks").length && !called(run, "create_tasks").length, "changed nothing"),
        ],
    },
    {
        name: "'stop suggesting steps' is saved as a help that doesn't work, with the avoid tag",
        level: "simple",
        runs: 3,
        memoryMode: "basic",
        turns: ["Please stop suggesting that I break tasks into steps. Step lists stress me out. Remember that."],
        check: async (run) => {
            const saved = called(run, "remember").find((c) => c.input?.action === "save");
            return [
                ...need(!!saved, "called remember"),
                ...need(saved?.input?.kind === "assist", "as what helps"),
                ...need(saved?.input?.avoid === "steps", "tagged avoid: steps"),
            ];
        },
    },
    {
        name: "router: greeting and how-to stay on the basic model",
        level: "simple",
        routed: true,
        turns: ["hi", "how do I add a routine?"],
        check: async (run) => [
            ...need(run.models.every((m) => m === env.AI_CHAT_MODEL_BASIC), `basic model throughout (got ${run.models.join(", ")})`),
            ...need(!run.calls.some((c) => !c.name.startsWith("get_")), "changed nothing"),
            ...need(/routine/i.test(run.text), "answered the how-to"),
        ],
    },
    {
        name: "router: a real ask takes over for good",
        smoke: true,
        level: "simple",
        routed: true,
        turns: ["hey", "add buy milk tomorrow", "thanks!"],
        check: async (run, t) => [
            ...need(run.models[0] === env.AI_CHAT_MODEL_BASIC, `opened basic (got ${run.models[0]})`),
            ...need(run.models.slice(1).every((m) => m === getModelId(env)), `standard from the add on, never back (got ${run.models.join(", ")})`),
            ...need(!!titled(await openTasks(t), "milk"), "milk task added"),
        ],
    },
];

// ── Runner ──────────────────────────────────────────────────────────────────
type Totals = Pick<Run, "steps" | "tokens" | "inputTokens" | "outputTokens" | "cached" | "written" | "cost" | "unknownCostSteps" | "failedRuns" | "ms">;
const selected = SCENARIOS.filter((scenario) => evaluation.profile !== "smoke" || scenario.smoke);
const report: ({ name: string; runs: number; level: string; passed: boolean; problems: string[]; calls: string[]; models: string[]; servedModels: string[] } & Totals)[] = [];
const warmups: Run[] = [];
let failedWarmups = 0;
/** The share of input read from the prompt cache (input includes cached tokens). */
const cachedShare = (r: Totals) => (r.tokens ? `${Math.round((r.cached / r.tokens) * 100)}%`.padStart(4) : "  -");

describe.skipIf(!env.OPENROUTER_API_KEY)("assistant evals", () => {
    beforeAll(async () => {
        await startTestDb();
        // One turn first writes the static prefix (tools + system prompt, the same for every
        // scenario) to the prompt cache; otherwise the concurrent first turns all miss and each pays to write it.
        for (const variant of variants) {
            try { warmups.push(await converse(await createUser({ zone: TZ }), ["hi"], NOW, false, variant)); }
            catch (error) { failedWarmups++; throw error; }
        }
    });
    afterAll(() => {
        const passed = report.filter((r) => r.passed).length;
        const sum = [...warmups, ...report].reduce((a, r) => ({ cost: a.cost + r.cost, tokens: a.tokens + r.tokens, cached: a.cached + r.cached }), { cost: 0, tokens: 0, cached: 0 });
        const rows = report.map((r) => `${r.passed ? "PASS" : "FAIL"}  ${r.level.padEnd(7)} ${r.name.padEnd(46)} ${String(r.steps).padStart(2)} steps ${String(r.tokens).padStart(6)} tok ${cachedShare(r)} cached ${r.unknownCostSteps || r.failedRuns ? "unknown cost" : `$${r.cost.toFixed(4)}`} ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${r.calls.join(" → ")}${r.problems.length ? `\n      ✗ ${r.problems.join("\n      ✗ ")}` : ""}`);
        process.stdout.write(`\nAssistant evals [${evaluation.profile}] (${env.AI_CHAT_MODEL ?? "default model"}): ${passed}/${report.length} passed · ${sum.tokens} tok, ${cachedShare(sum as Totals)} cached · known cost $${sum.cost.toFixed(4)}\n${rows.join("\n")}\n\n`);
        const dir = join(__dirname, "../../../../output/evals");
        mkdirSync(dir, { recursive: true });
        const unknown = [...warmups, ...report].reduce((n, r) => n + r.unknownCostSteps, 0);
        const failedRuns = report.reduce((n, r) => n + r.failedRuns, failedWarmups);
        writeFileSync(join(dir, `${reportName}.json`), JSON.stringify({ profile: evaluation.profile, repetitionLimit: maxRuns, availableScenarios: SCENARIOS.length, warmupKnownCost: warmups.reduce((n, r) => n + r.cost, 0), selectedScenarios: selected.length, variants, at: new Date().toISOString(), model: env.AI_CHAT_MODEL ?? "default", passed, total: report.length, cost: unknown || failedRuns ? null : sum.cost, knownCost: sum.cost, unknownCostSteps: unknown, failedRuns,
            report: report.map((r) => ({ ...r, cost: r.unknownCostSteps || r.failedRuns ? null : r.cost, knownCost: r.cost })) }, null, 2));
    });

    for (const [index, scenario] of selected.entries()) for (const variant of (index % 2 ? [...variants].reverse() : variants)) {
        it.concurrent(`${scenario.name}`, async () => {
            const total: Totals = { steps: 0, tokens: 0, inputTokens: 0, outputTokens: 0, cached: 0, written: 0, cost: 0, unknownCostSteps: 0, failedRuns: 0, ms: 0 };
            const problems: string[] = [];
            let calls: string[] = [];
            const models = new Set<string>(), servedModels = new Set<string>();
            const runs = Math.min(scenario.runs ?? 1, maxRuns);
            for (let attempt = 1; attempt <= runs; attempt++) {
                const userId = await createUser({ zone: TZ, ...(scenario.memoryMode && { settings: { assistant: { memoryMode: scenario.memoryMode, memoryEpoch: 1 } } }) });
                const t = Object.assign(toolsFor(userId, scenario.now), { userId });
                const seeded = (await scenario.seed?.(t)) ?? {};
                let run: Run;
                try { run = await converse(userId, scenario.turns, scenario.now, scenario.routed, variant); }
                catch (error) {
                    total.failedRuns++;
                    problems.push(`run ${attempt}: generation failed (${error instanceof Error ? error.name : "unknown error"}); usage/cost unknown`);
                    continue;
                }
                run.models.forEach((id) => models.add(id));
                run.servedModels.forEach((id) => servedModels.add(id));
                const found = [...(await scenario.check(run, t, seeded)), ...failedCalls(run).filter((p) => !p.startsWith("get_"))];
                problems.push(...found.map((p) => (runs > 1 ? `run ${attempt}: ${p}` : p)));
                for (const key of Object.keys(total) as (keyof Totals)[]) total[key] += run[key];
                calls = [...new Set(run.calls.map((c) => c.step))].map((step) => run.calls.filter((c) => c.step === step).map((c) => c.name).join("+"));
            }
            report.push({ name: scenario.name, runs, level: scenario.level, passed: problems.length === 0, problems, ...total, calls, models: [...models], servedModels: [...servedModels] });
            expect(problems).toEqual([]);
        });
    }
});
