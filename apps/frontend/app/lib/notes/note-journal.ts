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
}

// One lock per account, not per note: the owners index is shared by all of the account's notes.
export const noteJournal: NoteJournal = {
    put: (userId, owner, record) =>
        locked(`${PREFIX}:${userId}`, async () => {
            const branches = (await read<Branches>(keyOf(userId, owner))) ?? {};
            await write(keyOf(userId, owner), { ...branches, [record.branch]: record });
            const owners = (await read<string[]>(indexKey(userId))) ?? [];
            if (!owners.includes(owner)) await write(indexKey(userId), [...owners, owner]);
        }),
    remove: (userId, owner, branch) =>
        locked(`${PREFIX}:${userId}`, async () => {
            const { [branch]: _gone, ...rest } = (await read<Branches>(keyOf(userId, owner))) ?? {};
            if (Object.keys(rest).length) return write(keyOf(userId, owner), rest);
            await write(keyOf(userId, owner), undefined);
            const owners = ((await read<string[]>(indexKey(userId))) ?? []).filter((o) => o !== owner);
            await write(indexKey(userId), owners.length ? owners : undefined);
        }),
    list: async (userId, owner) => Object.values((await read<Branches>(keyOf(userId, owner))) ?? {}),
};

/** Set aside a version the user didn't pick (a conflict choice); it stays until they discard it. */
export function keepRecoveryCopy(journal: NoteJournal, userId: string, owner: string, branch: string, body: string): Promise<DraftRecord> {
    const record: DraftRecord = { branch: `recovery-${branch}`, baseBody: "", baseVersion: 0, body, gen: 0, updatedAt: Date.now(), kind: "recovery" };
    return journal.put(userId, owner, record).then(() => record);
}

/** Forget every note draft of an account on this device (sign-out that drops unsynced work). */
export async function clearNoteJournal(userId: string): Promise<void> {
    await locked(`${PREFIX}:${userId}`, async () => {
        for (const owner of (await read<string[]>(indexKey(userId))) ?? []) await write(keyOf(userId, owner), undefined);
        await write(indexKey(userId), undefined);
    });
}
