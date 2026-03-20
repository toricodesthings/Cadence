import { hc } from "hono/client";
import type { AppType } from "@cadence/backend";
import type { ApiClient } from "./client";
import { authenticatedFetch } from "./client";
import { API_BASE_URL } from "../env";
import { unwrapResponse } from "./helpers";
import type { MutationOp, WalEntry } from "./offline-wal";
import {
    getWalSnapshot,
    initWal,
    removeWalEntry,
    updateWalEntry,
    retryFailedEntries,
} from "./offline-wal";
import { hardRefreshWorkspaceCaches } from "./workspace-cache";
import type { QueryClient } from "@tanstack/react-query";

function createReplayClient(): ApiClient {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return hc<AppType>(API_BASE_URL, {
        fetch: (input: RequestInfo | URL, requestInit?: RequestInit) =>
            authenticatedFetch(input, { ...requestInit, authenticated: true }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any as ApiClient;
}

/**
 * Execute a single mutation operation against the API.
 * Used both for direct execution and WAL replay.
 */
async function executeMutationOp(client: ApiClient, op: MutationOp): Promise<unknown> {
    switch (op.type) {
        case "create_task": {
            const res = await client.api.tasks.$post({ json: op.payload });
            return unwrapResponse(res);
        }
        case "update_task": {
            const res = await client.api.tasks[":id"].$patch({
                param: { id: op.id },
                json: op.payload,
            });
            return unwrapResponse(res);
        }
        case "delete_task": {
            const res = await client.api.tasks[":id"].$delete({ param: { id: op.id } });
            if (res.status === 404) return null; // Already deleted — treat as success
            return unwrapResponse(res);
        }
        case "reorder_task": {
            const res = await client.api.tasks[":id"].reorder.$patch({
                param: { id: op.id },
                json: op.payload,
            });
            return unwrapResponse(res);
        }
        case "duplicate_task": {
            const res = await client.api.tasks[":id"].duplicate.$post({
                param: { id: op.id },
            });
            return unwrapResponse(res);
        }
        case "batch_state": {
            const res = await client.api.tasks.batch.state.$patch({
                json: op.payload as { taskIds: string[]; state: "ACTIVE" | "WAITING" | "COMPLETE" | "ARCHIVED" },
            });
            return unwrapResponse(res);
        }
        case "batch_reschedule": {
            const res = await client.api.tasks.batch.reschedule.$post({
                json: op.payload,
            });
            return unwrapResponse(res);
        }
        case "batch_delete": {
            const results = await Promise.all(
                op.payload.taskIds.map((id) =>
                    client.api.tasks[":id"].$delete({ param: { id } }),
                ),
            );
            return results;
        }
        case "create_inbox": {
            const res = await client.api.inbox.$post({ json: op.payload });
            return unwrapResponse(res);
        }
        case "update_inbox": {
            const res = await client.api.inbox[":id"].$patch({
                param: { id: op.id },
                json: op.payload,
            });
            if (!res.ok) throw new Error("Failed to update inbox item");
            return res.json();
        }
        case "delete_inbox": {
            const res = await client.api.inbox[":id"].$delete({ param: { id: op.id } });
            if (res.status === 404) return null;
            return unwrapResponse(res);
        }
        case "process_inbox_to_task": {
            const { inboxItemId, rawText, title, keepNote, scheduledDate, projectId, tagIds, priority, durationEstimate, recurrenceRule, waitingOn, nlp } = op.payload;
            const taskTitle = title?.trim() || rawText;
            const taskRes = await (client.api.inbox[":id"] as any).process.$post({
                param: { id: inboxItemId },
                json: {
                    clientMutationId: crypto.randomUUID(),
                    title: taskTitle,
                    keepNote,
                    scheduledDate,
                    projectId,
                    tagIds,
                    priority,
                    durationEstimate,
                    recurrenceRule,
                    waitingOn,
                    nlp,
                },
            });
            const task = await unwrapResponse(taskRes);
            return task;
        }
        case "create_inbox_section": {
            const res = await client.api.inbox.sections.$post({ json: op.payload });
            if (!res.ok) throw new Error("Failed to create inbox section");
            return res.json();
        }
        case "update_inbox_section": {
            const res = await client.api.inbox.sections[":id"].$patch({
                param: { id: op.id },
                json: op.payload,
            });
            if (!res.ok) throw new Error("Failed to update inbox section");
            return res.json();
        }
        case "delete_inbox_section": {
            const res = await client.api.inbox.sections[":id"].$delete({ param: { id: op.id } });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error("Failed to delete inbox section");
            return res.json();
        }
        case "create_habit": {
            const res = await client.api.habits.$post({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                json: op.payload as any,
            });
            return unwrapResponse(res);
        }
        case "update_habit": {
            const res = await client.api.habits[":id"].$patch({
                param: { id: op.id },
                json: op.payload as Record<string, unknown>,
            });
            return unwrapResponse(res);
        }
        case "delete_habit": {
            const res = await client.api.habits[":id"].$delete({ param: { id: op.id } });
            if (res.status === 404) return null;
            return unwrapResponse(res);
        }
        case "resolve_habit": {
            const res = await client.api.habits[":id"].resolve.$post({
                param: { id: op.id },
                json: op.payload as { targetDate: string; status: "COMPLETED" | "SKIPPED" | "PENDING" },
            });
            return unwrapResponse(res);
        }
        default: {
            const _exhaustive: never = op;
            throw new Error(`Unknown mutation operation: ${(_exhaustive as MutationOp).type}`);
        }
    }
}

// ── WAL Replay ──

let replayInProgress = false;

/**
 * Replay all pending WAL entries in order.
 * Called when the browser comes back online.
 * After replay, invalidates all TanStack Query caches.
 */
export async function replayWal(queryClient: QueryClient): Promise<void> {
    if (replayInProgress) return;
    replayInProgress = true;

    try {
        await initWal();
        const client = createReplayClient();
        const entries = getWalSnapshot().filter(
            (e): e is WalEntry & { status: "pending" } => e.status === "pending",
        );

        if (entries.length === 0) return;

        for (const entry of entries) {
            await updateWalEntry(entry.id, { status: "replaying" });

            try {
                await executeMutationOp(client, entry.op);
                await removeWalEntry(entry.id);
            } catch (err) {
                await updateWalEntry(entry.id, {
                    status: "failed",
                    error: err instanceof Error ? err.message : "Unknown error",
                });
            }
        }

        // Layer 4: After replay, resync all caches with server state
        await hardRefreshWorkspaceCaches(queryClient);
    } finally {
        replayInProgress = false;
    }
}

/**
 * Retry failed entries then replay.
 */
export async function retryAndReplay(queryClient: QueryClient): Promise<void> {
    await retryFailedEntries();
    await replayWal(queryClient);
}
