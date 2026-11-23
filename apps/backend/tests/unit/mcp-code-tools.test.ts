import { describe, expect, it, vi } from "vitest";
import { TOOL_CATALOG } from "@cadence/contracts/ai-tools";
import type { PublishedEntry, PublishedTool } from "../../src/domains/mcp/server";
import { coreTools } from "../../src/domains/ai/tools";
import { REVERTS, callKey, codeTools, publicOutcome, unwrap } from "../../src/domains/mcp/code-tools";

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const bad = (code: string) => ({
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ error: { code } }) }],
});

const real = coreTools({} as never, "u", {
    timezone: "UTC",
    currentDate: "",
    today: "2026-01-01",
}) as unknown as Record<string, { inputSchema: PublishedEntry["schema"] }>;
/** Every catalog tool as an entry: the real shared schema, a spy for `call`. */
const entries = (call: (args: unknown) => Promise<unknown> = vi.fn(async () => ok({ ok: true }))) =>
    (Object.entries(TOOL_CATALOG) as [PublishedTool, { kind: string }][])
        .filter(([, spec]) => spec.kind !== "ask")
        .map(([name, spec]) => ({
            name,
            write: spec.kind !== "read",
            destructive: false,
            schema: real[name].inputSchema,
            summary: `${name} summary`,
            description: "",
            inputSchema: real[name].inputSchema,
            call,
        })) as unknown as PublishedEntry[];

// A real execution id's shape: `exec_<16 digits>_<uuid>`.
const ctx = { executionId: "exec_0001795473042890_37939ee5-d998-457b-bc50-906edcec8c0e" };
const KEY = /^cm:37939ee5-d998-457b-bc50-906edcec8c0e:/;

describe("codeTools", () => {
    it("requires approval for exactly the delete_* methods", () => {
        const tools = codeTools(entries());
        const approval = Object.keys(tools).filter((n) => tools[n].requiresApproval);
        expect(approval.length).toBeGreaterThan(0);
        expect(approval).toEqual(Object.keys(tools).filter((n) => n.startsWith("delete_")));
    });

    it("fills operationKey on writes, nothing on reads, and confirm on deletes", async () => {
        const call = vi.fn(async (_a: unknown) => ok({ fine: true }));
        const tools = codeTools(entries(call));
        await tools.get_tasks.execute({ limit: 5 }, ctx);
        expect(call.mock.calls[0][0]).toEqual({ limit: 5 });
        await tools.set_task_state.execute({ taskIds: ["a"], state: "COMPLETE" }, ctx);
        expect(call.mock.calls[1][0]).toMatchObject({ operationKey: expect.stringMatching(KEY) });
        expect(call.mock.calls[1][0]).not.toHaveProperty("confirm");
        await tools.delete_tag.execute({ tagId: "t", name: "n" }, ctx);
        expect(call.mock.calls[2][0]).toMatchObject({
            confirm: true,
            operationKey: expect.stringMatching(KEY),
        });
    });

    it("hands the sandbox the parsed body, and throws the REST error body on failure", async () => {
        expect(unwrap(ok({ a: 1 }))).toEqual({ a: 1 });
        const tools = codeTools(entries(vi.fn(async () => bad("NOT_FOUND"))));
        const err = await Promise.resolve(tools.get_tasks.execute({}, ctx)).catch((e: Error) => e);
        expect(JSON.parse((err as Error).message)).toEqual({ error: { code: "NOT_FOUND" } });
    });

    it("publishes input schemas without regex patterns or the MCP-only keys", () => {
        const tools = codeTools(entries());
        const json = JSON.stringify(Object.values(tools).map((t) => t.inputSchema));
        expect(json).not.toContain('"pattern"');
        for (const t of Object.values(tools))
            for (const key of ["operationKey", "confirm", "dryRun"])
                expect(Object.keys((t.inputSchema as { properties?: object }).properties ?? {})).not.toContain(key);
    });
});

describe("callKey", () => {
    it("fits operationKey's 100 characters for a real execution id, forward and revert", () => {
        for (const key of [callKey(ctx.executionId), callKey(ctx.executionId, true)]) {
            expect(key).toMatch(KEY);
            expect(key.length).toBeLessThanOrEqual(100);
        }
        expect(callKey(ctx.executionId, true)).toContain(":r:");
    });
});

describe("REVERTS", () => {
    const U = "0198a0a0-0000-7000-8000-000000000001";
    const results: Record<string, [unknown, unknown]> = {
        create_tasks: [{}, { created: [{ taskId: U }, { taskId: U }] }],
        duplicate_tasks: [{}, { created: [{ taskId: U, title: "x", from: U }] }],
        create_project: [{}, { projectId: U, name: "Trip" }],
        create_sections: [{}, { sections: [{ sectionId: U, name: "A" }] }],
        create_tag: [{}, { tagId: U, name: "old" }],
        create_habit: [{}, { habitId: U, title: "Gym" }],
        capture_to_inbox: [{}, { item: { id: U, rawText: "idea" } }],
    };

    it("covers every creation, and each pair passes its target tool's real schema", () => {
        expect(Object.keys(REVERTS).sort()).toEqual(Object.keys(results).sort());
        for (const [name, revert] of Object.entries(REVERTS)) {
            const [args, result] = results[name];
            const pairs = revert!(args, result);
            expect(pairs.length).toBeGreaterThan(0);
            for (const [target, input] of pairs) {
                const shape = { ...input, operationKey: callKey(ctx.executionId, true), confirm: true };
                const parsed = real[target].inputSchema.safeParse(shape);
                expect([name, target, parsed.success]).toEqual([name, target, true]);
            }
        }
    });

    it("create_tasks undo archives exactly the created ids, through the published call", async () => {
        const call = vi.fn(async (_a: unknown) => ok({ updated: 2 }));
        const tools = codeTools(entries(call));
        await tools.create_tasks.revert!({}, { created: [{ taskId: "a" }, { taskId: "b" }] }, ctx);
        expect(call.mock.calls[0][0]).toMatchObject({ taskIds: ["a", "b"], state: "ARCHIVED" });
        expect((call.mock.calls[0][0] as { operationKey: string }).operationKey.length).toBeLessThanOrEqual(100);
    });

    it("a failed revert throws, so the runtime reports it and goes on", async () => {
        const tools = codeTools(entries(vi.fn(async () => bad("NOT_FOUND"))));
        await expect(tools.create_tag.revert!({}, { tagId: "t", name: "n" }, ctx)).rejects.toThrow("NOT_FOUND");
    });
});

describe("publicOutcome", () => {
    it("drops the calls log and keeps the last 20 log lines", () => {
        const logs = Array.from({ length: 30 }, (_, i) => `l${i}`);
        const out = publicOutcome({ status: "completed", calls: [{ seq: 0 }], logs }) as Record<string, unknown>;
        expect(out).not.toHaveProperty("calls");
        expect(out.logs).toEqual(logs.slice(-20));
    });
});
