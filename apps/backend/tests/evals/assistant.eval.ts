/**
 * Assistant evals: the real agent (prompt, tools, model) against a real database,
 * from one-line adds to multi-step chains. Each scenario seeds its own user
 * through the tools, sends one or more turns in Full approval mode (writes run),
 * then checks the calls the model chained and the data they left behind.
 *
 * Costs model tokens, so it never runs with `pnpm test`: `pnpm eval:assistant`
 * (needs OPENROUTER_API_KEY in the environment or `.dev.vars`; AI_CHAT_MODEL
 * picks another model). Prints a summary and writes `output/evals/assistant.json`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { getAgentInstance } from "../../src/domains/ai/agent";
import { buildToolRegistry } from "../../src/domains/ai/tools";
import type { Env } from "../../src/types/env";
import { withRls } from "../../src/platform/rls";
import { habits } from "../../src/db/schema";
import { eq } from "drizzle-orm";
import { todayIn } from "@cadence/domain/time";

const TZ = "America/Toronto";
/** Wednesday 2026-09-23, 10:00 in Toronto. */
const NOW = "2026-09-23T14:00:00.000Z";
const TODAY = "2026-09-23";

/** `.dev.vars` values, for a local run without exported variables. */
function devVars(): Record<string, string> {
    try {
        return Object.fromEntries(readFileSync(join(__dirname, "../../.dev.vars"), "utf8").split("\n")
            .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/)).filter(Boolean).map((m) => [m![1], m![2]]));
    } catch {
        return {};
    }
}
const vars = { ...devVars(), ...process.env } as Record<string, string | undefined>;
const env = { OPENROUTER_API_KEY: vars.OPENROUTER_API_KEY, AI_CHAT_MODEL: vars.AI_CHAT_MODEL } as unknown as Env;

type Call = { step: number; name: string; input: any; output: any };
type Tools = ReturnType<typeof toolsFor> & { userId?: string };
interface Run { calls: Call[]; text: string; steps: number; tokens: number; ms: number }
interface Scenario {
    name: string;
    level: "simple" | "medium" | "complex";
    seed?: (t: Tools) => Promise<Record<string, any>>;
    turns: string[];
    /** The user's clock for this scenario (default: NOW). */
    now?: string;
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

async function converse(userId: string, turns: string[], now = NOW): Promise<Run> {
    const calls: Call[] = [];
    const messages: any[] = [];
    let text = "";
    let steps = 0;
    let tokens = 0;
    const started = Date.now();
    for (const turn of turns) {
        const { agent, turnContext } = await getAgentInstance(env, userId, { timezone: TZ, currentDate: now, approvalMode: "full", nonce: "evalnonce", queryText: turn });
        messages.push({ role: "user", content: turn });
        // Like production: this turn's context rides on the newest user message, never stored in history.
        const result = await agent.generate({ messages: [...messages.slice(0, -1), { role: "user", content: `${turn}\n\n${turnContext}` }] });
        for (const [i, step] of result.steps.entries()) {
            for (const call of step.toolCalls) {
                const output = step.toolResults.find((r: any) => r.toolCallId === call.toolCallId)?.output;
                calls.push({ step: steps + i, name: call.toolName, input: call.input, output });
            }
        }
        steps += result.steps.length;
        tokens += result.totalUsage?.totalTokens ?? 0;
        text = result.text;
        // Every step's calls and results, as production replays them from the stored parts: in ai v7
        // `result.response.messages` is the last step only, which left later turns without the ids.
        messages.push(...result.steps.flatMap((step) => step.response.messages));
    }
    return { calls, text, steps, tokens, ms: Date.now() - started };
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

const SCENARIOS: Scenario[] = [
    {
        name: "add a timed task",
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
                ...need(!!tag && task?.tagIds?.includes(tag.id), "task carries an errands tag"),
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
        check: async (run) => need(called(run, "delete_project").length === 0 && /\?/.test(run.text), "asks first (keep or trash its tasks)"),
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
                ...need(!!job && tasks.every((task) => task.tagIds?.includes(job.id)), "every task now tagged job"),
                ...failedCalls(run),
            ];
        },
    },
    {
        name: "show a saved focus view",
        level: "medium",
        seed: async (t) => {
            await t("create_tasks", { tasks: [{ title: "Quick email", effort: 1 }, { title: "Big migration", effort: 3 }] });
            await t("create_focus_view", { name: "Quick wins", filters: { effortMax: 1 } });
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
            ...need(/3005/.test(run.text) && /2000/.test(run.text), "asks which, naming both sections"),
        ],
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
            ...need(!/overdue/i.test(run.text), "doesn't call today's task overdue"),
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
            ...need((run.text.match(/2:35\s*(PM|pm)|14:35/g) ?? []).length >= 1, "says 2:35 PM"),
            ...need(!/1:35|3:35/.test(run.text), "never shifts the time an hour"),
            ...need(run.calls.every((c) => c.name.startsWith("get_")), "reads only"),
        ],
    },
];

// ── Runner ──────────────────────────────────────────────────────────────────
const report: { name: string; level: string; passed: boolean; problems: string[]; steps: number; tokens: number; ms: number; calls: string[] }[] = [];

describe.skipIf(!env.OPENROUTER_API_KEY)("assistant evals", () => {
    beforeAll(startTestDb);
    afterAll(() => {
        const passed = report.filter((r) => r.passed).length;
        const rows = report.map((r) => `${r.passed ? "PASS" : "FAIL"}  ${r.level.padEnd(7)} ${r.name.padEnd(46)} ${String(r.steps).padStart(2)} steps ${String(r.tokens).padStart(6)} tok ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${r.calls.join(" → ")}${r.problems.length ? `\n      ✗ ${r.problems.join("\n      ✗ ")}` : ""}`);
        process.stdout.write(`\nAssistant evals (${env.AI_CHAT_MODEL ?? "default model"}): ${passed}/${report.length} passed\n${rows.join("\n")}\n\n`);
        const dir = join(__dirname, "../../../../output/evals");
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, "assistant.json"), JSON.stringify({ at: new Date().toISOString(), model: env.AI_CHAT_MODEL ?? "default", passed, total: report.length, report }, null, 2));
    });

    for (const scenario of SCENARIOS) {
        it.concurrent(scenario.name, async () => {
            const total = { steps: 0, tokens: 0, ms: 0 };
            const problems: string[] = [];
            let calls: string[] = [];
            for (let attempt = 1; attempt <= (scenario.runs ?? 1); attempt++) {
                const userId = await createUser({ zone: TZ });
                const t = Object.assign(toolsFor(userId, scenario.now), { userId });
                const seeded = (await scenario.seed?.(t)) ?? {};
                const run = await converse(userId, scenario.turns, scenario.now);
                const found = [...(await scenario.check(run, t, seeded)), ...failedCalls(run).filter((p) => !p.startsWith("get_"))];
                problems.push(...found.map((p) => ((scenario.runs ?? 1) > 1 ? `run ${attempt}: ${p}` : p)));
                total.steps += run.steps; total.tokens += run.tokens; total.ms += run.ms;
                calls = [...new Set(run.calls.map((c) => c.step))].map((step) => run.calls.filter((c) => c.step === step).map((c) => c.name).join("+"));
            }
            report.push({ name: scenario.name, level: scenario.level, passed: problems.length === 0, problems, ...total, calls });
            expect(problems).toEqual([]);
        });
    }
});
