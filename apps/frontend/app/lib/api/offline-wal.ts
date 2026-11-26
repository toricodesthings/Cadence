import { get, set, del } from "idb-keyval";
import type { CreateTaskInput, TaskState, UpdateTaskInput } from "@cadence/contracts/task";
import type { CreateProjectInput, UpdateProject } from "@cadence/contracts/project";
import type { CreateTagInput, UpdateTag } from "@cadence/contracts/tag";
import type { ProcessInboxItem, UpdateInboxItemInput, UpdateInboxSectionInput } from "@cadence/contracts/inbox";
import type { HabitStatus, InsertHabit, StepStatus, UpdateHabit } from "@cadence/contracts/habit";
import type { Instant, LocalDate } from "@cadence/domain/time";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";

export type ProcessInboxPayload = Omit<ProcessInboxItem, "title"> & {
    inboxItemId: string;
    rawText: string;
    title?: string;
};

export interface NoteSavePayload {
    body: string;
    expectedVersion?: number;
    expectedUpdatedAt?: string;
    branch?: string;
    baseBody?: string;
    opId?: string;
}

export type MutationOp =
    | { type: "create_task"; payload: CreateTaskInput & { id: string } }
    | { type: "update_task"; id: string; payload: UpdateTaskInput }
    | { type: "delete_task"; id: string }
    | { type: "reorder_task"; id: string; payload: { orderIndex: number; orderedTaskIds?: string[] } }
    | { type: "duplicate_task"; id: string }
    | { type: "batch_state"; payload: { taskIds: string[]; state: TaskState } }
    | {
          type: "batch_reschedule";
          payload: { taskIds: string[]; date: LocalDate } | { taskIds: string[]; scheduledStart: Instant };
      }
    | { type: "batch_delete"; payload: { taskIds: string[] } }
    | { type: "create_inbox"; payload: { id: string; rawText: string; sectionId?: string; orderIndex?: number } }
    | { type: "update_inbox"; id: string; payload: UpdateInboxItemInput }
    | { type: "delete_inbox"; id: string }
    | { type: "process_inbox_to_task"; payload: ProcessInboxPayload }
    | { type: "create_inbox_section"; payload: { name: string; orderIndex?: number } }
    | { type: "update_inbox_section"; id: string; payload: UpdateInboxSectionInput }
    | { type: "delete_inbox_section"; id: string }
    | { type: "create_habit"; payload: InsertHabit & { id: string } }
    | { type: "update_habit"; id: string; payload: UpdateHabit }
    | { type: "delete_habit"; id: string }
    | {
          type: "resolve_habit";
          id: string;
          payload: {
              targetDate: LocalDate;
              status: HabitStatus;
              stepStatus?: StepStatus;
              time?: string;
              at?: string;
          };
      }
    | { type: "unprocess_inbox"; id: string }
    | { type: "upsert_note"; taskId: string; payload: NoteSavePayload }
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

export interface WalRequest {
    method: "POST" | "PATCH" | "DELETE";
    url: string;
    json?: unknown;
    key?: string;
}

export type WalEntryStatus = "pending" | "replaying" | "failed";

export interface WalEntry {
    id: string;
    attempted?: boolean;
    conflict?: boolean;
    op: MutationOp;
    requests?: WalRequest[];
    status: WalEntryStatus;
    error?: string;
    createdAt: number;
}

function createdIds(op: MutationOp): string[] | null {
    switch (op.type) {
        case "create_task":
        case "create_inbox":
        case "create_habit":
        case "create_project":
        case "create_tag":
            return [op.payload.id];
        case "create_subtask":
            return [op.payload.id, op.taskId];
        case "create_section":
            return op.payload.projectId ? [op.payload.id, op.payload.projectId] : [op.payload.id];
        case "create_inbox_section":
            return [];
        default:
            return null;
    }
}

export function walTargetIds(op: MutationOp): string[] {
    const created = createdIds(op);
    if (created) return created;
    switch (op.type) {
        case "upsert_note":
            return [op.taskId];
        case "add_task_tag":
        case "remove_task_tag":
            return [op.id, op.tagId];
        case "batch_state":
        case "batch_reschedule":
        case "batch_delete":
            return op.payload.taskIds;
        case "process_inbox_to_task":
            return [op.payload.inboxItemId];
        default:
            return [(op as Extract<MutationOp, { id: string }>).id];
    }
}

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
            if (event.data === userId)
                void readKey(walKey(nextUserId)).then((entries) => userId === nextUserId && setCache(entries));
        };
    }

    await mutate((entries) =>
        entries.map((e) => (e.status === "replaying" ? { ...e, status: "pending" as const } : e)),
    );
    const legacy = await readKey(LEGACY_KEY);
    if (legacy.length) {
        await mutate((entries) => [...legacy, ...entries]);
        await writeKey(LEGACY_KEY, []);
    }
}

export async function enqueueWalEntry(op: MutationOp, requests?: WalRequest[]): Promise<WalEntry> {
    const entry: WalEntry = {
        id: crypto.randomUUID(),
        op,
        requests,
        status: "pending",
        createdAt: Date.now(),
    };
    await mutate((entries) => {
        if (op.type !== "upsert_note" || !op.payload.branch) return [...entries, entry];
        const earlier = entries.findIndex(
            (e) =>
                e.status === "pending" &&
                !e.attempted &&
                !e.conflict &&
                e.op.type === "upsert_note" &&
                e.op.taskId === op.taskId &&
                e.op.payload.branch === op.payload.branch &&
                e.op.payload.expectedVersion === op.payload.expectedVersion,
        );
        if (earlier < 0) return [...entries, entry];
        return entries.map((e, i) => (i === earlier ? { ...e, op, requests } : e));
    });
    return entry;
}

export async function updateWalEntry(
    id: string,
    patch: Partial<Pick<WalEntry, "status" | "error" | "attempted" | "conflict">>,
): Promise<void> {
    await mutate((entries) => entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export async function replaceWalEntryOp(id: string, op: MutationOp, requests: WalRequest[]): Promise<void> {
    await mutate((entries) =>
        entries.map((e) =>
            e.id === id
                ? {
                      ...e,
                      op,
                      requests,
                      status: "pending" as const,
                      error: undefined,
                      attempted: false,
                      conflict: false,
                  }
                : e,
        ),
    );
}

export async function removeWalEntry(id: string): Promise<void> {
    await mutate((entries) => entries.filter((e) => e.id !== id));
}

export async function clearWal(): Promise<void> {
    await mutate(() => []);
}

export async function retryFailedEntries(): Promise<void> {
    await mutate((entries) =>
        entries.map((e) => (e.status === "failed" ? { ...e, status: "pending" as const, error: undefined } : e)),
    );
}

export function withReplayLock(fn: () => Promise<void>): Promise<void> {
    const owner = userId;
    if (!owner) return Promise.resolve();
    if (typeof navigator === "undefined" || !navigator.locks) return fn();
    return navigator.locks.request(`cadence-wal-replay:${owner}`, { ifAvailable: true }, (lock) =>
        lock ? fn() : undefined,
    );
}
