import { get, set } from "idb-keyval";
import type { CreateTaskInput, UpdateTaskInput } from "../../types/task";

// ── Operation Descriptors ──
// Every mutation the app can perform, represented as a serializable object.

export type MutationOp =
    | { type: "create_task"; payload: CreateTaskInput & { clientMutationId: string } }
    | { type: "update_task"; id: string; payload: UpdateTaskInput }
    | { type: "delete_task"; id: string }
    | { type: "reorder_task"; id: string; payload: { orderIndex: number; orderedTaskIds?: string[] } }
    | { type: "duplicate_task"; id: string }
    | { type: "batch_state"; payload: { taskIds: string[]; state: string } }
    | { type: "batch_reschedule"; payload: { taskIds: string[]; scheduledStart: string; isAllDay: boolean } }
    | { type: "batch_delete"; payload: { taskIds: string[] } }
    | { type: "create_inbox"; payload: { rawText: string; clientMutationId: string; sectionId?: string; orderIndex?: number } }
    | { type: "update_inbox"; id: string; payload: Record<string, unknown> }
    | { type: "delete_inbox"; id: string }
    | { type: "process_inbox_to_task"; payload: { inboxItemId: string; rawText: string; keepNote?: boolean } }
    | { type: "create_inbox_section"; payload: { name: string; orderIndex?: number; clientMutationId: string } }
    | { type: "update_inbox_section"; id: string; payload: Record<string, unknown> }
    | { type: "delete_inbox_section"; id: string }
    | { type: "create_habit"; payload: Record<string, unknown> & { clientMutationId: string } }
    | { type: "update_habit"; id: string; payload: Record<string, unknown> }
    | { type: "delete_habit"; id: string }
    | { type: "resolve_habit"; id: string; payload: { targetDate: string; status: string } };

// ── WAL Entry ──

export type WalEntryStatus = "pending" | "replaying" | "failed";

export interface WalEntry {
    id: string;
    op: MutationOp;
    status: WalEntryStatus;
    error?: string;
    createdAt: number;
}

// ── IndexedDB Storage ──

const WAL_KEY = "cadence-mutation-wal";

async function loadWal(): Promise<WalEntry[]> {
    return (await get<WalEntry[]>(WAL_KEY)) ?? [];
}

async function persistWal(entries: WalEntry[]): Promise<void> {
    await set(WAL_KEY, entries);
}

// ── In-memory state + subscriptions ──

let walCache: WalEntry[] = [];
let initialized = false;
const listeners = new Set<() => void>();

function notify() {
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

// ── Initialization ──

export async function initWal(): Promise<void> {
    if (initialized) return;
    walCache = await loadWal();
    initialized = true;
    notify();
}

// ── Mutations ──

export async function enqueueWalEntry(op: MutationOp): Promise<WalEntry> {
    if (!initialized) await initWal();

    const entry: WalEntry = {
        id: crypto.randomUUID(),
        op,
        status: "pending",
        createdAt: Date.now(),
    };

    walCache = [...walCache, entry];
    await persistWal(walCache);
    notify();
    return entry;
}

export async function updateWalEntry(
    id: string,
    patch: Partial<Pick<WalEntry, "status" | "error">>,
): Promise<void> {
    walCache = walCache.map((e) => (e.id === id ? { ...e, ...patch } : e));
    await persistWal(walCache);
    notify();
}

export async function removeWalEntry(id: string): Promise<void> {
    walCache = walCache.filter((e) => e.id !== id);
    await persistWal(walCache);
    notify();
}

export async function clearFailedEntries(): Promise<void> {
    walCache = walCache.filter((e) => e.status !== "failed");
    await persistWal(walCache);
    notify();
}

export async function retryFailedEntries(): Promise<void> {
    walCache = walCache.map((e) =>
        e.status === "failed" ? { ...e, status: "pending" as const, error: undefined } : e,
    );
    await persistWal(walCache);
    notify();
}
