import { get, set, del } from "idb-keyval";
import { IS_DESKTOP_RUNTIME, getNativeStore } from "../../platform/runtime";

export interface DraftRecord {
    branch: string;
    baseBody: string;
    baseVersion: number;
    body: string;
    gen: number;
    updatedAt: number;
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
    return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(name, fn) : fn();
}

export interface NoteJournal {
    put(userId: string, owner: string, record: DraftRecord): Promise<void>;
    remove(userId: string, owner: string, branch: string): Promise<void>;
    list(userId: string, owner: string): Promise<DraftRecord[]>;
}

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

export function keepRecoveryCopy(
    journal: NoteJournal,
    userId: string,
    owner: string,
    branch: string,
    body: string,
): Promise<DraftRecord> {
    const record: DraftRecord = {
        branch: `recovery-${branch}`,
        baseBody: "",
        baseVersion: 0,
        body,
        gen: 0,
        updatedAt: Date.now(),
        kind: "recovery",
    };
    return journal.put(userId, owner, record).then(() => record);
}

export async function clearNoteJournal(userId: string): Promise<void> {
    await locked(`${PREFIX}:${userId}`, async () => {
        for (const owner of (await read<string[]>(indexKey(userId))) ?? [])
            await write(keyOf(userId, owner), undefined);
        await write(indexKey(userId), undefined);
    });
}
