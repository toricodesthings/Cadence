/**
 * The tab's note sessions, one per account + canonical owner. A session outlives the
 * editor that opened it so closing the room never loses the newest work; it is dropped
 * once nothing uses it and nothing is unsaved. A different account never inherits a
 * previous account's session.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { TaskNote } from "@cadence/contracts/note";
import { NoteSession } from "./note-session";
import { noteJournal } from "./note-journal";
import { holdBranch, branchAlive } from "./note-locks";
import { announceNoteSaved } from "./note-channel";
import { fetchTaskNote, sendTaskNote } from "../../hooks/tasks/use-task-note-api";
import { queryKeys } from "../api/query-keys";
import { getWalSnapshot, subscribeWal, removeWalEntry } from "../api/offline-wal";

interface Entry {
    session: NoteSession;
    users: number;
    timer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, Entry>();
const keyOf = (userId: string, owner: string) => `${userId}:${owner}`;
const LINGER_MS = 30_000;

let watchingPage = false;
/** Hidden or closing tab: drafts go to the device and pending saves go out, for every note open anywhere in the tab. */
function watchPage() {
    if (watchingPage || typeof document === "undefined") return;
    watchingPage = true;
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && checkpointNoteSessions());
    window.addEventListener("pagehide", checkpointNoteSessions);
}

export function acquireNoteSession(queryClient: QueryClient, userId: string, ownerId: string, legacySeed?: () => string): NoteSession {
    watchPage();
    for (const [key, entry] of sessions) {
        if (!key.startsWith(`${userId}:`)) drop(key, entry);
    }
    const key = keyOf(userId, ownerId);
    let entry = sessions.get(key);
    if (!entry) {
        const noteKey = queryKeys.notes.detail(ownerId);
        const session = new NoteSession({
            userId,
            ownerId,
            fetchNote: async () => {
                const note = await fetchTaskNote(ownerId);
                queryClient.setQueryData(noteKey, note);
                return note;
            },
            cachedNote: () => queryClient.getQueryData<TaskNote | null>(noteKey),
            send: sendTaskNote(ownerId),
            publish: (next) => queryClient.setQueryData(noteKey, next),
            announce: (message) => announceNoteSaved({ userId, ...message }),
            journal: noteJournal,
            walEntries: getWalSnapshot,
            subscribeWal,
            isOnline: () => navigator.onLine,
            branchAlive,
            holdBranch,
            legacySeed,
        });
        session.discardQueued = (branch) => {
            for (const e of getWalSnapshot()) {
                if (e.op.type === "upsert_note" && e.op.taskId === ownerId && e.op.payload.branch === branch) void removeWalEntry(e.id);
            }
        };
        entry = { session, users: 0 };
        sessions.set(key, entry);
    }
    clearTimeout(entry.timer);
    entry.users++;
    return entry.session;
}

export function releaseNoteSession(userId: string, ownerId: string) {
    const key = keyOf(userId, ownerId);
    const entry = sessions.get(key);
    if (!entry) return;
    entry.users = Math.max(0, entry.users - 1);
    if (entry.users > 0) return;
    entry.session.checkpoint();
    const retire = () => {
        if (entry.users > 0) return;
        if (entry.session.hasUnsavedWork) {
            entry.timer = setTimeout(retire, LINGER_MS);
            return;
        }
        drop(key, entry);
    };
    entry.timer = setTimeout(retire, LINGER_MS);
}

/** Keeps the draft on the device but sends nothing: after an account switch, a request would go out as the new account. */
function drop(key: string, entry: Entry, keepDraft = true) {
    clearTimeout(entry.timer);
    if (keepDraft) void entry.session.persist();
    entry.session.dispose();
    sessions.delete(key);
}

/** Sign-out that drops unsynced work: close every session without writing anything more. */
export function discardNoteSessions() {
    for (const [key, entry] of sessions) drop(key, entry, false);
}

/** Save everything pending in this tab (sign-out, hide). */
export async function flushNoteSessions(): Promise<boolean> {
    const results = await Promise.all([...sessions.values()].map((e) => e.session.flush()));
    return results.every((r) => r !== "failed");
}

export function checkpointNoteSessions() {
    for (const e of sessions.values()) e.session.checkpoint();
}

/** Notes with text no server holds yet, in this tab. */
export function unsyncedNoteCount(): number {
    return [...sessions.values()].filter((e) => e.session.hasUnsavedWork).length;
}
