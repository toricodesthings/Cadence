import { get, set, del } from "idb-keyval";
import type { CreateTaskInput, UpdateTaskInput } from "@cadence/contracts/task";
import type { CreateProjectInput, UpdateProject } from "@cadence/contracts/project";
import type { CreateTagInput, UpdateTag } from "@cadence/contracts/tag";
import type { CanonicalNlpEnvelope } from "@cadence/nlp/core";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";

// ── Operation Descriptors ──
// Every mutation the app can queue, as a serializable object. Creates carry the
// client-chosen id, so later ops can target the entity before it syncs.

export type MutationOp =
    | { type: "create_task"; payload: CreateTaskInput & { id: string } }
    | { type: "update_task"; id: string; payload: UpdateTaskInput }
    | { type: "delete_task"; id: string }
    | { type: "reorder_task"; id: string; payload: { orderIndex: number; orderedTaskIds?: string[] } }
    | { type: "duplicate_task"; id: string }
    | { type: "batch_state"; payload: { taskIds: string[]; state: string } }
    | { type: "batch_reschedule"; payload: { taskIds: string[]; scheduledStart: string; isAllDay: boolean } }
    | { type: "batch_delete"; payload: { taskIds: string[] } }
    | { type: "create_inbox"; payload: { id: string; rawText: string; sectionId?: string; orderIndex?: number } }
    | { type: "update_inbox"; id: string; payload: Record<string, unknown> }
    | { type: "delete_inbox"; id: string }
    | { type: "process_inbox_to_task"; payload: { inboxItemId: string; rawText: string; complete?: boolean; title?: string; scheduledDate?: string; dueDate?: string | null; scheduledStart?: string | null; scheduledEnd?: string | null; isAllDay?: boolean | null; projectId?: string | null; tagIds?: string[]; priority?: number | null; durationEstimate?: number | null; recurrenceRule?: string | null; waitingOn?: string | null; nlp?: CanonicalNlpEnvelope } }
    | { type: "create_inbox_section"; payload: { name: string; orderIndex?: number } }
    | { type: "update_inbox_section"; id: string; payload: Record<string, unknown> }
    | { type: "delete_inbox_section"; id: string }
    | { type: "create_habit"; payload: Record<string, unknown> & { id: string } }
    | { type: "update_habit"; id: string; payload: Record<string, unknown> }
    | { type: "delete_habit"; id: string }
    | { type: "resolve_habit"; id: string; payload: { targetDate: string; status: string; stepStatus?: Record<string, "COMPLETED" | "SKIPPED">; timezone?: string } }
    | { type: "unprocess_inbox"; id: string }
    | { type: "upsert_note"; taskId: string; payload: { body: string; expectedUpdatedAt?: string } }
    | { type: "add_task_tag"; id: string; tagId: string }
    | { type: "remove_task_tag"; id: string; tagId: string }
    | { type: "create_subtask"; taskId: string; payload: { id: string; title: string; orderIndex: number } }
    | { type: "update_subtask"; id: string; payload: { title?: string; isComplete?: boolean } }
    | { type: "delete_subtask"; id: string }
    | { type: "reorder_subtask"; id: string; payload: { orderIndex: number } }
    | { type: "create_project"; payload: CreateProjectInput & { id: string } }
    | { type: "update_project"; id: string; payload: UpdateProject }
    | { type: "create_tag"; payload: CreateTagInput & { id: string } }
    | { type: "update_tag"; id: string; payload: UpdateTag }
    | { type: "create_section"; payload: { id: string; name: string; orderIndex: number; projectId: string | null } }
    | { type: "update_section"; id: string; payload: { name?: string; orderIndex?: number } };

/** The plain request an op becomes, stored so the service worker can replay it without the app. */
export interface WalRequest {
    method: "POST" | "PATCH" | "DELETE";
    url: string;
    json?: unknown;
    /** Idempotency-Key when it isn't the entry id: a create's entity id, the key its online call sent. */
    key?: string;
}

// ── WAL Entry ──

export type WalEntryStatus = "pending" | "replaying" | "failed";

export interface WalEntry {
    /** Also the Idempotency-Key of requests without their own. */
    id: string;
    op: MutationOp;
    requests?: WalRequest[];
    status: WalEntryStatus;
    error?: string;
    createdAt: number;
}

/** Every entity id an op touches: creates by their client id, batches by each task. */
export function walTargetIds(op: MutationOp): string[] {
    switch (op.type) {
        case "create_task":
        case "create_inbox":
        case "create_habit":
        case "create_project":
        case "create_tag":
            return [op.payload.id];
        case "create_subtask":
            return [op.payload.id, op.taskId];
        case "upsert_note":
            return [op.taskId];
        case "add_task_tag":
        case "remove_task_tag":
            return [op.id, op.tagId];
        case "create_section":
            return op.payload.projectId ? [op.payload.id, op.payload.projectId] : [op.payload.id];
        case "batch_state":
        case "batch_reschedule":
        case "batch_delete":
            return op.payload.taskIds;
        case "process_inbox_to_task":
            return [op.payload.inboxItemId];
        case "create_inbox_section":
            return [];
        default:
            return [op.id];
    }
}

// ── Storage: one queue per account ──
// A queue never replays into another account (B6), and a read-cache version
// bump never touches it.

const WAL_PREFIX = "cadence-mutation-wal";
const LEGACY_KEY = WAL_PREFIX;

let userId: string | null = null;
const walKey = (id: string) => `${WAL_PREFIX}:${id}`;

async function nativeStore() {
    return IS_DESKTOP_RUNTIME ? getNativeStore("cadence_wal") : null;
}

async function readKey(key: string): Promise<WalEntry[]> {
    const store = await nativeStore();
    return (store ? await store.get<WalEntry[]>(key) : await get<WalEntry[]>(key)) ?? [];
}

async function writeKey(key: string, entries: WalEntry[]): Promise<void> {
    const store = await nativeStore();
    if (store) await (entries.length ? store.set(key, entries) : store.del(key));
    else await (entries.length ? set(key, entries) : del(key));
}

// ── Cross-tab safety (B7) ──
// Every read-modify-write holds a Web Lock and reads the stored queue fresh, so
// two tabs never overwrite each other; a broadcast tells the others to reload.

let channel: BroadcastChannel | null = null;

function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (typeof navigator === "undefined" || !navigator.locks) return fn();
    return navigator.locks.request(name, fn);
}

async function mutate(change: (entries: WalEntry[]) => WalEntry[]): Promise<void> {
    const owner = userId;
    if (!owner) throw new Error("No account loaded for the offline queue");
    await withLock(`cadence-wal:${owner}`, async () => {
        const next = change(await readKey(walKey(owner)));
        await writeKey(walKey(owner), next);
        if (owner === userId) setCache(next);
    });
    channel?.postMessage(owner);
}

// ── In-memory state + subscriptions ──

let walCache: WalEntry[] = [];
const listeners = new Set<() => void>();

function setCache(entries: WalEntry[]) {
    walCache = entries;
    for (const l of listeners) l();
}

export function subscribeWal(cb: () => void): () => void {
    listeners.add(cb);
    return () => {
        listeners.delete(cb);
    };
}

export function getWalSnapshot(): WalEntry[] {
    return walCache;
}

export function getWalServerSnapshot(): WalEntry[] {
    return [];
}

export function getWalUserId(): string | null {
    return userId;
}

// ── Initialization ──

/** Load this account's queue; `null` (signed out) empties the in-memory view. */
export async function initWal(nextUserId: string | null): Promise<void> {
    if (nextUserId === userId) return;
    userId = nextUserId;
    channel?.close();
    channel = null;
    if (!nextUserId) {
        setCache([]);
        return;
    }

    if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("cadence-wal");
        channel.onmessage = (event) => {
            if (event.data === userId) void readKey(walKey(nextUserId)).then((entries) => userId === nextUserId && setCache(entries));
        };
    }

    // An entry left "replaying" by a closed tab never finished: try it again.
    await mutate((entries) => entries.map((e) => (e.status === "replaying" ? { ...e, status: "pending" as const } : e)));
    // A queue from before queues were per account: adopt it once.
    const legacy = await readKey(LEGACY_KEY);
    if (legacy.length) {
        await mutate((entries) => [...legacy, ...entries]);
        await writeKey(LEGACY_KEY, []);
    }
}

// ── Mutations ──

export async function enqueueWalEntry(op: MutationOp, requests?: WalRequest[]): Promise<WalEntry> {
    const entry: WalEntry = {
        id: crypto.randomUUID(),
        op,
        requests,
        status: "pending",
        createdAt: Date.now(),
    };
    await mutate((entries) => {
        // Every offline save of a note carries the whole text: keep one, with the
        // newest text and the version it started from (for the conflict check).
        if (op.type !== "upsert_note") return [...entries, entry];
        const earlier = entries.findIndex((e) => e.status === "pending" && e.op.type === "upsert_note" && e.op.taskId === op.taskId);
        if (earlier < 0) return [...entries, entry];
        const base = entries[earlier].op as typeof op;
        const payload = { ...op.payload, expectedUpdatedAt: base.payload.expectedUpdatedAt };
        const merged = { ...entries[earlier], op: { ...op, payload }, requests: requests?.map((r) => ({ ...r, json: payload })) };
        return entries.map((e, i) => (i === earlier ? merged : e));
    });
    return entry;
}

export async function updateWalEntry(
    id: string,
    patch: Partial<Pick<WalEntry, "status" | "error">>,
): Promise<void> {
    await mutate((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export async function removeWalEntry(id: string): Promise<void> {
    await mutate((entries) => entries.filter((e) => e.id !== id));
}

/** Drop this account's queued changes (sign-out after the user agreed to lose them). */
export async function clearWal(): Promise<void> {
    await mutate(() => []);
}

export async function retryFailedEntries(): Promise<void> {
    await mutate((entries) => entries.map((e) =>
        e.status === "failed" ? { ...e, status: "pending" as const, error: undefined } : e,
    ));
}

/** Run replay in one tab (or the service worker) at a time; others skip. */
export function withReplayLock(fn: () => Promise<void>): Promise<void> {
    const owner = userId;
    if (!owner) return Promise.resolve();
    if (typeof navigator === "undefined" || !navigator.locks) return fn();
    return navigator.locks.request(`cadence-wal-replay:${owner}`, { ifAvailable: true }, (lock) => (lock ? fn() : undefined));
}
