import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { apiAs } from "../helpers/app";
import { createUser, startTestDb } from "../helpers/db";

vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));

import { inboxRoutes } from "../../src/domains/inbox/inbox.route";
import { projectRoutes } from "../../src/domains/projects/projects.route";
import { sectionRoutes } from "../../src/domains/sections/sections.route";
import { taskRoutes } from "../../src/domains/tasks/tasks.route";
import { searchRoutes } from "../../src/domains/decisions/search.route";
import { buildToolRegistry } from "../../src/domains/ai/tools";

const env = { OPENROUTER_API_KEY: "k", AI_DECISION_MODEL: "vendor/model-20260101" };
let userId: string;
let inbox: ReturnType<typeof apiAs>;
let projects: ReturnType<typeof apiAs>;
let sections: ReturnType<typeof apiAs>;
let tasks: ReturnType<typeof apiAs>;
let search: ReturnType<typeof apiAs>;
let sent: any[];

/** The model "picks" the option whose description contains `pick` (or abstains), with probability `p`. */
function modelPicks(pick: string | null, p = 0.97) {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body);
        sent.push(body);
        const criteria = body.questions.pick.criteria as Record<string, string>;
        const key = pick ? Object.keys(criteria).find((k) => criteria[k].includes(pick)) : undefined;
        return new Response(JSON.stringify({
            model: "vendor/model-20260101",
            answers: { pick: { type: "choice", choice: key ?? "none", probabilities: { [key ?? "none"]: key ? p : 0.9 } } },
            usage: { input_tokens: 50, output_tokens: 3, cost: 0.00001 },
        }), { status: 200, headers: { "content-type": "application/json" } });
    }));
}

beforeAll(startTestDb);
beforeEach(async () => {
    sent = [];
    userId = await createUser();
    inbox = apiAs(userId, "/inbox", inboxRoutes, env);
    projects = apiAs(userId, "/projects", projectRoutes, env);
    sections = apiAs(userId, "/sections", sectionRoutes, env);
    tasks = apiAs(userId, "/tasks", taskRoutes, env);
    search = apiAs(userId, "/search", searchRoutes, env);
});
afterEach(() => vi.unstubAllGlobals());

async function roster() {
    const work = (await projects("POST", "", { name: "Work" })).body.data;
    const uni = (await projects("POST", "", { name: "Uni" })).body.data;
    const comp = (await sections("POST", "", { name: "COMP2000", orderIndex: 0, projectId: uni.id })).body.data;
    return { work, uni, comp };
}

describe("S1: pre-sorted captures", () => {
    it("stores the model's list and section on the capture, and sends no ids or other text", async () => {
        const { uni, comp } = await roster();
        modelPicks("Uni › COMP2000");
        const { body } = await inbox("POST", "", { rawText: "Finish the COMP2000 assignment" });
        const [item] = (await inbox("GET", "")).body.data.filter((i: any) => i.id === body.data.id);
        expect(item.analysis.suggestedPlacement).toMatchObject({ projectId: uni.id, sectionId: comp.id, model: "vendor/model-20260101" });
        const wire = JSON.stringify(sent[0]);
        expect(wire).not.toContain(uni.id);
        expect(Object.keys(sent[0].questions.pick.criteria)).toContain("none");
    });

    it("stores nothing when the model abstains or falls short of the threshold", async () => {
        await roster();
        modelPicks(null);
        const a = (await inbox("POST", "", { rawText: "ugh everything" })).body.data;
        modelPicks("Work", 0.5);
        const b = (await inbox("POST", "", { rawText: "something vague" })).body.data;
        const rows = (await inbox("GET", "")).body.data;
        for (const id of [a.id, b.id]) expect(rows.find((i: any) => i.id === id).analysis?.suggestedPlacement).toBeUndefined();
    });

    it("makes no call with no lists, with the switch off, or with no model set", async () => {
        modelPicks("Work");
        await inbox("POST", "", { rawText: "no lists yet" });
        await roster();
        await apiAs(userId, "/settings", (await import("../../src/domains/settings/settings.route")).settingsRoutes)("PATCH", "", { tasks: { intelligence: { smartPlacement: false } } });
        await inbox("POST", "", { rawText: "switch is off" });
        expect(sent).toHaveLength(0);
        const off = apiAs(userId, "/inbox", inboxRoutes, { ...env, AI_DECISION_MODEL: "" });
        await off("POST", "", { rawText: "no model" });
        expect(sent).toHaveLength(0);
    });

    it("never fails the save when the provider errors", async () => {
        await roster();
        vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
        const { status } = await inbox("POST", "", { rawText: "still saved" });
        expect(status).toBe(201);
    });

    it("rejects a section from a different list instead of dropping it", async () => {
        const { work, comp } = await roster();
        const cap = (await inbox("POST", "", { rawText: "mismatch" })).body.data;
        const res = await inbox("POST", `/${cap.id}/process`, { title: "mismatch", projectId: work.id, sectionId: comp.id });
        expect(res.status).toBe(400);
        const noList = await inbox("POST", `/${cap.id}/process`, { title: "mismatch", sectionId: comp.id, projectId: null });
        expect(noList.status).toBe(400);
    });

    it("places a capture with its section", async () => {
        const { uni, comp } = await roster();
        const cap = (await inbox("POST", "", { rawText: "ok" })).body.data;
        const res = await inbox("POST", `/${cap.id}/process`, { title: "ok", projectId: uni.id, sectionId: comp.id });
        expect(res.body.data).toMatchObject({ projectId: uni.id, sectionId: comp.id });
    });
});

describe("S2: did you mean", () => {
    it("offers the recent task the model picks, from the search route", async () => {
        await tasks("POST", "", { title: "Renew lease", orderIndex: 0 });
        modelPicks("Renew lease");
        const { body } = await search("POST", "/did-you-mean", { query: "tenancy renewal" });
        expect(body.data.task.title).toBe("Renew lease");
    });

    it("lists the closest spelling first, ahead of newer tasks", async () => {
        await tasks("POST", "", { title: "Book dentist appointment", orderIndex: 0 });
        await tasks("POST", "", { title: "Water plants", orderIndex: 1 });
        modelPicks("Book dentist appointment");
        await search("POST", "/did-you-mean", { query: "dentsit" });
        expect(sent[0].questions.pick.criteria.o1).toBe("Book dentist appointment");
    });

    it("answers null when the switch is off", async () => {
        await tasks("POST", "", { title: "Renew lease", orderIndex: 0 });
        await apiAs(userId, "/settings", (await import("../../src/domains/settings/settings.route")).settingsRoutes)("PATCH", "", { tasks: { intelligence: { smartPlacement: false } } });
        modelPicks("Renew lease");
        expect((await search("POST", "/did-you-mean", { query: "tenancy" })).body.data.task).toBeNull();
        expect(sent).toHaveLength(0);
    });

    it("adds possibleMatch to an empty assistant search only", async () => {
        await tasks("POST", "", { title: "Renew lease", orderIndex: 0 });
        modelPicks("Renew lease");
        const registry = buildToolRegistry(env as any, userId, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const empty = await registry.get_tasks.execute({ query: "tenancy", limit: 20 }, { toolCallId: "t", messages: [] });
        expect(empty.possibleMatch.title).toBe("Renew lease");
        const hit = await registry.get_tasks.execute({ query: "lease", limit: 20 }, { toolCallId: "t2", messages: [] });
        expect(hit.possibleMatch).toBeUndefined();
    });

    it("never offers a different numeric identifier, even when the model would pick it", async () => {
        await tasks("POST", "", { title: "Implement 0.31.01", orderIndex: 0 });
        modelPicks("Implement 0.31.01");
        const registry = buildToolRegistry(env as any, userId, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const result = await registry.get_tasks.execute({ query: "implmentation 0.31.0", limit: 20 }, { toolCallId: "t", messages: [] });
        expect(result).toMatchObject({ tasks: [], count: 0 });
        expect(result.possibleMatch).toBeUndefined();
        expect(sent).toHaveLength(0);
    });

    it("offers typos only within the original filters and identifier", async () => {
        const { work, uni, comp } = await roster();
        await tasks("POST", "", { title: "Implement 0.31.0 Work", orderIndex: 0, projectId: work.id });
        await tasks("POST", "", { title: "Implement 0.32.0", orderIndex: 0, projectId: uni.id, sectionId: comp.id });
        await tasks("POST", "", { title: "Implement 0.31.0 Uni", orderIndex: 0, projectId: uni.id, sectionId: comp.id });
        modelPicks("Implement 0.31.0 Uni");
        const registry = buildToolRegistry(env as any, userId, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const result = await registry.get_tasks.execute({ query: "implmentation 0.31.0", projectId: uni.id, sectionId: comp.id, limit: 20 }, { toolCallId: "t", messages: [] });
        expect(result).toMatchObject({ tasks: [], count: 0, possibleMatch: { title: "Implement 0.31.0 Uni" } });
        // Shared spelling matching needs no model call and still respects every original filter.
        expect(sent).toHaveLength(0);
    });

    it.each([
        { dueWindow: "overdue" }, { from: "2026-09-24" }, { noDate: true }, { pinned: true },
        { minPriority: 4 }, { tagId: "00000000-0000-4000-8000-000000000001" }, { state: "COMPLETE" },
    ])("does not escape filters on a fuzzy suggestion: %j", async (filter) => {
        await tasks("POST", "", { title: "Renew lease", orderIndex: 0, dueDate: "2026-09-23" });
        modelPicks("Renew lease");
        const registry = buildToolRegistry(env as any, userId, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const result = await registry.get_tasks.execute({ query: "tenancy", ...filter, limit: 20 }, { toolCallId: "t", messages: [] });
        expect(result).toMatchObject({ tasks: [], count: 0 });
        expect(result.possibleMatch).toBeUndefined();
        expect(sent).toHaveLength(0);
    });

    it("can suggest a completed task only when completed state was requested", async () => {
        const task = (await tasks("POST", "", { title: "Renew lease", orderIndex: 0 })).body.data;
        await tasks("PATCH", `/${task.id}`, { state: "COMPLETE" });
        modelPicks("Renew lease");
        const registry = buildToolRegistry(env as any, userId, { timezone: "UTC", currentDate: "2026-09-23T12:00:00Z", today: "2026-09-23" }) as any;
        const result = await registry.get_tasks.execute({ query: "tenancy", state: "COMPLETE", limit: 20 }, { toolCallId: "t", messages: [] });
        expect(result.possibleMatch).toMatchObject({ id: task.id, title: "Renew lease" });
    });
});
