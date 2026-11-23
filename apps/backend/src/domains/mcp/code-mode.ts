import { DurableObject } from "cloudflare:workers";
import {
    CodemodeConnector,
    DynamicWorkerExecutor,
    createCodemodeRuntime,
    truncateResult,
    type ConnectorTools,
} from "@cloudflare/codemode";
import { appOrigin, type Env } from "../../types/env";
import { logger, issuesFromError } from "../../platform/log";
import type { AgentContext } from "../ai/tools/index";
import { codeTools, publicOutcome } from "./code-tools";
import { instructions, publishedTools, type PublishedEntry } from "./server";

/**
 * Code Mode: the model writes JavaScript against a typed `cadence.*` SDK that runs in an isolated Dynamic Worker and
 * returns only the final data. One `CodeModeHost` per person; one runtime (history + approvals) per connection.
 * Every SDK method is a published tool (`publishedTools`), so budgets, validation and error bodies are the direct tools'.
 */

/** The request's session, as plain data across RPC. The connection row was already checked by `serveMcp`. */
export type CodeSession = {
    userId: string;
    connectionId: string;
    scopes: string[];
    memoryOn: boolean;
    ctx: Omit<AgentContext, "waitUntil">;
};
export type CodeDecision = { code: string } | { executionId: string; decision: "approve" | "reject" | "undo" };
/** completed | paused | error | rejected | rolled_back, each with the run's id and its own keys (never the `calls` log). */
export type CodeOutcome = { status: string; executionId: string; [key: string]: unknown };

class CadenceConnector extends CodemodeConnector<Env> {
    constructor(
        ctx: DurableObjectState,
        env: Env,
        private entries: PublishedEntry[],
        private brief: string,
    ) {
        super(ctx, env);
    }
    name() {
        return "cadence";
    }
    protected instructions() {
        return this.brief;
    }
    protected tools(): ConnectorTools {
        return codeTools(this.entries);
    }
}

/** Search hits: the model needs the path, what it does and whether it pauses. */
const hit = (r: { path: string; description?: string; requiresApproval?: boolean }) => ({
    path: r.path,
    description: r.description,
    requiresApproval: r.requiresApproval,
});

export class CodeModeHost extends DurableObject<Env> {
    #runtime(s: CodeSession) {
        // Remembered so `forget()` can delete every connection's facet.
        this.ctx.storage.kv.put(`conn:${s.connectionId}`, 1);
        let wrote = false;
        const entries = publishedTools(
            this.env,
            s.userId,
            s.connectionId,
            new Set(s.scopes),
            { ...s.ctx, waitUntil: (p) => this.ctx.waitUntil(p) },
            s.memoryOn,
            () => {
                wrote = true;
            },
        );
        const rt = createCodemodeRuntime({
            ctx: this.ctx,
            name: s.connectionId,
            // No fetch()/connect(): the sandbox reaches only the connector. 30s keeps a stuck loop from holding a request.
            executor: new DynamicWorkerExecutor({ loader: this.env.LOADER!, timeout: 30_000, globalOutbound: null }),
            connectors: [
                new CadenceConnector(
                    this.ctx,
                    this.env,
                    entries,
                    instructions(s.ctx as AgentContext, appOrigin(this.env), "code"),
                ),
            ],
            transformResult: (r) => truncateResult(r),
        });
        return { rt, entries, wrote: () => wrote };
    }

    async search(s: CodeSession, query: string) {
        const { results } = await this.#runtime(s).rt.search(query);
        return results.slice(0, 10).map(hit);
    }

    describe(s: CodeSession, path: string) {
        return this.#runtime(s).rt.describe(path);
    }

    /** `wrote`: the run changed something, so the Worker replans reminders once (not once per write), as a direct call does. */
    async run(s: CodeSession, input: CodeDecision): Promise<{ outcome: CodeOutcome; wrote: boolean }> {
        const { rt, entries, wrote } = this.#runtime(s);
        const executionId = "executionId" in input ? input.executionId : "";
        try {
            let outcome: CodeOutcome;
            if ("code" in input) {
                await rt.expirePaused(); // paused runs older than 24h end here, so no cron is needed
                outcome = (await rt.execute({ code: input.code })) as CodeOutcome;
            } else if (input.decision === "approve") {
                outcome = (await rt.approve({ executionId })) as CodeOutcome;
            } else if (input.decision === "reject") {
                const [first] = await rt.pending(executionId);
                outcome = first
                    ? (await rt.reject({ executionId, seq: first.seq }), { status: "rejected", executionId })
                    : { status: "error", executionId, error: "Nothing in that run is waiting." };
            } else {
                await rt.rollback({ executionId });
                const writes = new Set(entries.filter((e) => e.write).map((e) => e.name as string));
                const log = ((await rt.executions()).find((e) => e.id === executionId)?.log ?? []).filter((c) =>
                    writes.has(c.method),
                );
                outcome = {
                    status: "rolled_back",
                    executionId,
                    undone: log.filter((c) => c.state === "reverted").map((c) => c.method),
                    kept: log.filter((c) => c.state === "applied").map((c) => c.method),
                };
            }
            return { outcome: publicOutcome(outcome), wrote: wrote() };
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            return { outcome: { status: "error", executionId, error }, wrote: wrote() };
        }
    }

    /** Disconnect: drop that connection's history. 0.5.6's internal facet name is `codemode:<name>`; re-check on a bump. */
    forgetConnection(connectionId: string) {
        this.ctx.facets.delete(`codemode:${connectionId}`);
        this.ctx.storage.kv.delete(`conn:${connectionId}`);
    }

    /** Account deletion: every connection's history, then the host itself. */
    async forget() {
        for (const [key] of this.ctx.storage.kv.list({ prefix: "conn:" })) this.forgetConnection(key.slice(5));
        await this.ctx.storage.deleteAll();
    }
}

export const codeHost = (env: Env, userId: string) =>
    env.CODE_MODE!.get(env.CODE_MODE!.idFromName(userId), { locationHint: "enam" });

/** Disconnect (one connection) or account deletion (all). Best effort: never fails the request. */
export async function forgetCodeMode(env: Env, userId: string, connectionId?: string): Promise<void> {
    if (!env.CODE_MODE) return;
    try {
        const host = codeHost(env, userId);
        await (connectionId ? host.forgetConnection(connectionId) : host.forget());
    } catch (err) {
        logger.warn("mcp", "code_mode_forget_failed", { issues: issuesFromError(err) });
    }
}
