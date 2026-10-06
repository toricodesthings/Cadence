import type { QueryClient } from "@tanstack/react-query";
import { apiClient, authenticatedFetch } from "./client";
import { parseApiError } from "./helpers";
import type { MutationOp, WalEntry, WalRequest } from "./offline-wal";
import {
    getWalSnapshot,
    removeWalEntry,
    retryFailedEntries,
    updateWalEntry,
    walTargetIds,
    withReplayLock,
} from "./offline-wal";
import { cancelWorkspaceQueries, invalidateWorkspaceCaches } from "./workspace-cache";
import { chunk } from "../utils";
import { ApiErrorResponse, isNetworkFailure } from "../../types/api";
import { reason } from "../utils/error-toast";

const api = apiClient.api;

/** A replay mustn't send the version check (see toRequests). */
function without<T extends object>(payload: T, key: string): T {
    const { [key]: _, ...rest } = payload as Record<string, unknown>;
    return rest as T;
}

/**
 * The HTTP request(s) an op becomes. URLs come from the typed client so a
 * renamed route fails typecheck. Replays skip `expectedUpdatedAt`: a queued
 * edit carries only the fields the user touched, so the later write wins
 * field by field (see the 0.24 conflict policy).
 */
export function toRequests(op: MutationOp): WalRequest[] {
    const url = (u: URL) => u.href;
    switch (op.type) {
        case "create_task":
            return [{ method: "POST", url: url(api.tasks.$url()), json: op.payload, key: op.payload.id }];
        case "update_task":
            return [{ method: "PATCH", url: url(api.tasks[":id"].$url({ param: { id: op.id } })), json: without(op.payload, "expectedUpdatedAt") }];
        case "delete_task":
            return [{ method: "DELETE", url: url(api.tasks[":id"].$url({ param: { id: op.id } })) }];
        case "reorder_task":
            return [{ method: "PATCH", url: url(api.tasks[":id"].reorder.$url({ param: { id: op.id } })), json: op.payload }];
        case "duplicate_task":
            return [{ method: "POST", url: url(api.tasks[":id"].duplicate.$url({ param: { id: op.id } })) }];
        case "batch_state":
            return [{ method: "PATCH", url: url(api.tasks.batch.state.$url()), json: op.payload }];
        case "batch_reschedule":
            return [{ method: "POST", url: url(api.tasks.batch.reschedule.$url()), json: op.payload }];
        case "batch_delete":
            // Older builds queued more than the route's 50-id cap.
            return chunk(op.payload.taskIds, 50).map((taskIds) => ({ method: "POST", url: url(api.tasks.batch.delete.$url()), json: { taskIds } }));
        case "create_inbox":
            return [{ method: "POST", url: url(api.inbox.$url()), json: op.payload, key: op.payload.id }];
        case "update_inbox":
            return [{ method: "PATCH", url: url(api.inbox[":id"].$url({ param: { id: op.id } })), json: op.payload }];
        case "delete_inbox":
            return [{ method: "DELETE", url: url(api.inbox[":id"].$url({ param: { id: op.id } })) }];
        case "process_inbox_to_task": {
            const { inboxItemId, rawText, title, ...rest } = op.payload;
            return [{ method: "POST", url: url(api.inbox[":id"].process.$url({ param: { id: inboxItemId } })), json: { ...rest, title: title?.trim() || rawText } }];
        }
        case "create_inbox_section":
            return [{ method: "POST", url: url(api.inbox.sections.$url()), json: op.payload }];
        case "update_inbox_section":
            return [{ method: "PATCH", url: url(api.inbox.sections[":id"].$url({ param: { id: op.id } })), json: op.payload }];
        case "delete_inbox_section":
            return [{ method: "DELETE", url: url(api.inbox.sections[":id"].$url({ param: { id: op.id } })) }];
        case "create_habit":
            return [{ method: "POST", url: url(api.habits.$url()), json: op.payload, key: op.payload.id }];
        case "update_habit":
            return [{ method: "PATCH", url: url(api.habits[":id"].$url({ param: { id: op.id } })), json: without(op.payload, "expectedUpdatedAt") }];
        case "delete_habit":
            return [{ method: "DELETE", url: url(api.habits[":id"].$url({ param: { id: op.id } })) }];
        case "resolve_habit":
            return [{ method: "POST", url: url(api.habits[":id"].resolve.$url({ param: { id: op.id } })), json: op.payload }];
        case "unprocess_inbox":
            return [{ method: "POST", url: url(api.inbox[":id"].unprocess.$url({ param: { id: op.id } })) }];
        case "upsert_note":
            return [{ method: "PATCH", url: url(api.tasks[":taskId"].note.$url({ param: { taskId: op.taskId } })), json: op.payload }];
        case "add_task_tag":
            return [{ method: "POST", url: url(api.tasks[":id"].tags.$url({ param: { id: op.id } })), json: { tagId: op.tagId } }];
        case "remove_task_tag":
            return [{ method: "DELETE", url: url(api.tasks[":id"].tags[":tagId"].$url({ param: { id: op.id, tagId: op.tagId } })) }];
        case "create_subtask":
            return [{ method: "POST", url: url(api.tasks[":taskId"].subtasks.$url({ param: { taskId: op.taskId } })), json: op.payload, key: op.payload.id }];
        case "update_subtask":
            return [{ method: "PATCH", url: url(api.subtasks[":id"].$url({ param: { id: op.id } })), json: op.payload }];
        case "delete_subtask":
            return [{ method: "DELETE", url: url(api.subtasks[":id"].$url({ param: { id: op.id } })) }];
        case "reorder_subtask":
            return [{ method: "PATCH", url: url(api.subtasks[":id"].reorder.$url({ param: { id: op.id } })), json: op.payload }];
        case "create_project":
            return [{ method: "POST", url: url(api.projects.$url()), json: op.payload, key: op.payload.id }];
        case "update_project":
            return [{ method: "PATCH", url: url(api.projects[":id"].$url({ param: { id: op.id } })), json: op.payload }];
        case "create_tag":
            return [{ method: "POST", url: url(api.tags.$url()), json: op.payload, key: op.payload.id }];
        case "update_tag":
            return [{ method: "PATCH", url: url(api.tags[":id"].$url({ param: { id: op.id } })), json: op.payload }];
        case "create_section":
            return [{ method: "POST", url: url(api.sections.$url()), json: op.payload, key: op.payload.id }];
        case "update_section":
            return [{ method: "PATCH", url: url(api.sections[":id"].$url({ param: { id: op.id } })), json: op.payload }];
        default: {
            const _exhaustive: never = op;
            throw new Error(`Unknown mutation operation: ${(_exhaustive as MutationOp).type}`);
        }
    }
}

async function send(entry: WalEntry): Promise<void> {
    const requests = toRequests(entry.op);
    for (const [index, request] of requests.entries()) {
        const res = await authenticatedFetch(request.url, {
            authenticated: true,
            method: request.method,
            headers: {
                // A create's key is its entity id, the same key its online call sent,
                // so a create that landed before the connection dropped isn't made twice.
                "Idempotency-Key": index ? `${request.key ?? entry.id}:${index}` : request.key ?? entry.id,
                ...(request.json !== undefined && { "Content-Type": "application/json" }),
            },
            body: request.json === undefined ? undefined : JSON.stringify(request.json),
        });
        if (!res.ok) throw await parseApiError(res);
    }
}

/**
 * The note changed elsewhere while this edit waited offline. Prose is never
 * overwritten: the offline text goes below the current note, marked.
 */
async function keepBothNotes(op: Extract<MutationOp, { type: "upsert_note" }>, editedAt: number) {
    const noteUrl = api.tasks[":taskId"].note.$url({ param: { taskId: op.taskId } }).href;
    const res = await authenticatedFetch(noteUrl, { authenticated: true });
    if (!res.ok) throw await parseApiError(res);
    const current = ((await res.json()) as { data: { body: string; updatedAt: string } | null }).data;
    if (current?.body === op.payload.body) return;
    const when = new Date(editedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const body = current?.body
        ? `${current.body}\n\n---\n\n*Offline edit, ${when}*\n\n${op.payload.body}`
        : op.payload.body;
    const save = await authenticatedFetch(noteUrl, {
        authenticated: true,
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, expectedUpdatedAt: current?.updatedAt }),
    });
    if (!save.ok) throw await parseApiError(save);
}

// ── WAL Replay ──

type EntryResult = "done" | "offline" | { error: string };

function classify(err: unknown, entry: WalEntry): EntryResult {
    // An account change mid-replay (say, a warm start's session came back as someone else)
    // got no answer: the change stays pending for its own account.
    const aborted = err instanceof DOMException && err.name === "AbortError";
    if (aborted || isNetworkFailure(err) || (err instanceof ApiErrorResponse && err.isRetryable)) return "offline";
    // Deletes win: a change to something deleted elsewhere is dropped.
    if (err instanceof ApiErrorResponse && err.status === 404 && !entry.op.type.startsWith("create_")) return "done";
    return { error: reason(err) };
}

async function replayOne(entry: WalEntry): Promise<EntryResult> {
    try {
        await send(entry);
        return "done";
    } catch (err) {
        if (!(err instanceof ApiErrorResponse && err.status === 409 && entry.op.type === "upsert_note")) return classify(err, entry);
        try {
            await keepBothNotes(entry.op, entry.createdAt);
            return "done";
        } catch (mergeError) {
            return classify(mergeError, entry);
        }
    }
}

type ReplayOutcome = "done" | "offline" | "idle";

/**
 * Replay pending entries in order, one tab at a time. A network failure stops
 * and leaves the rest pending; a change to something deleted elsewhere is
 * dropped (deletes win); anything after a failed change to the same item
 * waits with it instead of failing on its own.
 */
export async function replayWal(queryClient: QueryClient): Promise<ReplayOutcome> {
    let outcome: ReplayOutcome = "idle";
    await withReplayLock(async () => {
        let replayed = false;
        if (getWalSnapshot().some((e) => e.status === "pending")) await cancelWorkspaceQueries(queryClient);
        for (;;) {
            const entries = getWalSnapshot();
            const entry = entries.find((e) => e.status === "pending");
            if (!entry) break;

            const blocked = new Set(entries.filter((e) => e.status === "failed").flatMap((e) => walTargetIds(e.op)));
            if (walTargetIds(entry.op).some((id) => blocked.has(id))) {
                await updateWalEntry(entry.id, { status: "failed", error: "It depends on an earlier change that didn't sync." });
                continue;
            }

            await updateWalEntry(entry.id, { status: "replaying" });
            const result = await replayOne(entry);
            if (result === "offline") {
                await updateWalEntry(entry.id, { status: "pending" });
                outcome = "offline";
                break;
            }
            if (result === "done") {
                await removeWalEntry(entry.id);
                replayed = true;
            } else {
                await updateWalEntry(entry.id, { status: "failed", error: result.error });
            }
        }
        if (outcome !== "offline") outcome = replayed ? "done" : "idle";
        // Resync with the server, keeping inactive views cached for the next time offline.
        if (replayed) await invalidateWorkspaceCaches(queryClient);
    });
    return outcome;
}

/**
 * Retry failed entries then replay.
 */
export async function retryAndReplay(queryClient: QueryClient): Promise<void> {
    await retryFailedEntries();
    await replayWal(queryClient);
}

// ── Triggers ──

const BACKOFF_MS = [5_000, 15_000, 60_000, 5 * 60_000];

/**
 * Replay on startup, on `online`, when the app comes to the front, and on a
 * backoff timer while a replay stopped for the network. iOS has no background
 * sync, so these are the only chances it gets.
 */
export function startWalSync(queryClient: QueryClient): () => void {
    let timer: number | undefined;
    let attempt = 0;
    let stopped = false;

    const run = async () => {
        window.clearTimeout(timer);
        if (stopped || !navigator.onLine) return;
        const outcome = await replayWal(queryClient);
        if (stopped) return;
        if (outcome === "offline") {
            timer = window.setTimeout(run, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
        } else {
            attempt = 0;
        }
    };
    const onVisible = () => document.visibilityState === "visible" && void run();
    // Background Sync fired while the app is open: the service worker leaves it to us.
    const onWorkerMessage = (event: MessageEvent) => event.data?.type === "cadence-wal-replay" && void run();

    void run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    replayTrigger = run;
    return () => {
        stopped = true;
        window.clearTimeout(timer);
        window.removeEventListener("online", run);
        document.removeEventListener("visibilitychange", onVisible);
        navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
        if (replayTrigger === run) replayTrigger = null;
    };
}

let replayTrigger: (() => Promise<void>) | null = null;

/** Ask the running sync loop to replay soon (after a write was queued while online). */
export function requestReplay(): void {
    void replayTrigger?.();
}
