/**
 * Durable drafts for note editing: what makes "Saved on this device" true. One record
 * per account + note owner holding a draft per editing branch (a tab's line of edits),
 * written under a Web Lock so two tabs never overwrite each other. This is recovery
 * state, not a second queue: the offline queue (WAL) stays the only replay path.
 */
import { get, set, del } from "idb-keyval";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";

export interface DraftRecord {
    branch: string;
    /** Text and revision this branch started from (the last one the server acknowledged). */
    baseBody: string;
    baseVersion: number;
    body: string;
    gen: number;
    updatedAt: number;
    /** A version the user chose not to keep; stays until they discard it. */
    kind?: "draft" | "recovery";
}

type Branches = Record<string, DraftRecord>;

const PREFIX = "cadence-note-journal";
const keyOf = (userId: string, owner: string) => `${PREFIX}:${userId}:${owner}`;
const indexKey = (userId: string) => `${PREFIX}-index:${userId}`;

async function read<T>(key: string): Promise<T | undefined> {
    const store = IS_DESKTOP_RUNTIME ? await getNativeStore("cadence_wal") : null;
    return store ? store.get<T>(key) : get<T>(key);
}

async function write(key: string, value: unknown | undefined): Promise<void> {
    const store = IS_DESKTOP_RUNTIME ? await getNativeStore("cadence_wal") : null;
    if (store) await (value === undefined ? store.del(key) : store.set(key, value));
    else await (value === undefined ? del(key) : set(key, value));
}

function locked<T>(name: string, fn: () => Promise<T>): Promise<T> {
    // ponytail: without Web Locks a second tab could interleave; the server's revision check still protects the note itself.
    return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(name, fn) : fn();
}

export interface NoteJournal {
    put(userId: string, owner: string, record: DraftRecord): Promise<void>;
    remove(userId: string, owner: string, branch: string): Promise<void>;
    list(userId: string, owner: string): Promise<DraftRecord[]>;
    /** Owners with anything kept, for sign-out and recovery. */
    owners(userId: string): Promise<string[]>;
}

export const noteJournal: NoteJournal = {
    put: (userId, owner, record) =>
        locked(`${PREFIX}:${userId}:${owner}`, async () => {
            const branches = (await read<Branches>(keyOf(userId, owner))) ?? {};
            await write(keyOf(userId, owner), { ...branches, [record.branch]: record });
            const owners = (await read<string[]>(indexKey(userId))) ?? [];
            if (!owners.includes(owner)) await write(indexKey(userId), [...owners, owner]);
        }),
    remove: (userId, owner, branch) =>
        locked(`${PREFIX}:${userId}:${owner}`, async () => {
            const { [branch]: _gone, ...rest } = (await read<Branches>(keyOf(userId, owner))) ?? {};
            if (Object.keys(rest).length) return write(keyOf(userId, owner), rest);
            await write(keyOf(userId, owner), undefined);
            const owners = ((await read<string[]>(indexKey(userId))) ?? []).filter((o) => o !== owner);
            await write(indexKey(userId), owners.length ? owners : undefined);
        }),
    list: async (userId, owner) => Object.values((await read<Branches>(keyOf(userId, owner))) ?? {}),
    owners: async (userId) => (await read<string[]>(indexKey(userId))) ?? [],
};
