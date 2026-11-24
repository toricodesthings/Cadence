import type { CallToolResult } from "@modelcontextprotocol/server";
import type { ConnectorTools } from "@cloudflare/codemode";
import { z } from "zod";
import { dropPatterns } from "../ai/tools/index";
import type { PublishedEntry, PublishedTool } from "./server";

/**
 * Code Mode's SDK, derived from the published tools. Pure (only types from the package), so node tests load it.
 * Every method goes through the entry's own `call`, the same path as a direct call.
 */

/** A published call's result as the value the sandbox gets: the parsed body, or a thrown Error whose message is the REST error body. */
export function unwrap(result: CallToolResult): unknown {
    const text = (result.content[0] as { text: string }).text;
    if (result.isError) throw new Error(text);
    return JSON.parse(text);
}

/**
 * What `undo` calls for each creation: `[tool, input]` pairs, each a normal published call. Only creations have one:
 * no tool keeps a before-image of an edit. New tasks go to Trash (restorable); the rest have no Trash.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const REVERTS: Partial<Record<PublishedTool, (args: any, result: any) => [PublishedTool, object][]>> = {
    create_tasks: (_a, r) =>
        r.created?.length
            ? [["set_task_state", { taskIds: r.created.map((c: any) => c.taskId), state: "ARCHIVED" }]]
            : [],
    duplicate_tasks: (_a, r) =>
        r.created?.length
            ? [["set_task_state", { taskIds: r.created.map((c: any) => c.taskId), state: "ARCHIVED" }]]
            : [],
    create_project: (_a, r) => [["delete_project", { projectId: r.projectId, name: r.name, tasks: "trash" }]],
    create_sections: (_a, r) => r.sections.map((s: any) => ["delete_section", { sectionId: s.sectionId }]),
    create_tag: (_a, r) => [["delete_tag", { tagId: r.tagId, name: r.name }]],
    create_habit: (_a, r) => [["delete_habit", { habitId: r.habitId, title: r.title }]],
    capture_to_inbox: (_a, r) => [["delete_captures", { items: [{ inboxItemId: r.item.id, text: r.item.rawText }] }]],
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const isDelete = (name: string) => name.startsWith("delete_");

/**
 * A call key that traces back to the run and fits `operationKey`'s 100 characters: execution ids are
 * `exec_<16 digits>_<uuid>` (58), so only their uuid tail goes in. The durable log already guarantees an
 * applied call never runs twice, so the key only has to satisfy the schema.
 */
export const callKey = (executionId: string, revert = false) =>
    `cm:${executionId.slice(-36)}:${revert ? "r:" : ""}${crypto.randomUUID()}`;

/** The run's outcome as the model sees it: no `calls` log (it repeats every call's args and results), the last 20 log lines. */
export function publicOutcome<T extends object>(outcome: T): T {
    const { calls: _calls, ...rest } = outcome as T & { calls?: unknown; logs?: string[] };
    return (rest.logs ? { ...rest, logs: rest.logs.slice(-20) } : rest) as T;
}

export function codeTools(entries: PublishedEntry[]): ConnectorTools {
    const byName = new Map(entries.map((e) => [e.name, e]));
    const tools: ConnectorTools = {};
    for (const entry of entries) {
        const del = isDelete(entry.name);
        const revert = REVERTS[entry.name];
        tools[entry.name] = {
            description: entry.summary,
            inputSchema: dropPatterns(z.toJSONSchema(entry.schema, { io: "input", unrepresentable: "any" })) as never,
            // Every delete_* is a delete for good, so approval replaces `confirm`.
            requiresApproval: del,
            execute: async (args, c) =>
                unwrap(
                    await entry.call({
                        ...(args as object),
                        ...(entry.write && { operationKey: callKey(c!.executionId) }),
                        ...(del && { confirm: true }),
                    }),
                ),
            ...(revert && {
                revert: async (args: unknown, result: unknown, c?: { executionId: string }) => {
                    for (const [name, input] of revert(args, result)) {
                        const target = byName.get(name);
                        if (!target) {
                            throw new Error(`Undo requires ${name}, which is not granted by this token's scopes`);
                        }
                        unwrap(
                            await target.call({
                                ...input,
                                operationKey: callKey(c!.executionId, true),
                                ...(isDelete(name) && { confirm: true }),
                            }),
                        );
                    }
                },
            }),
        };
    }
    return tools;
}
