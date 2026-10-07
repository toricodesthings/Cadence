import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskNote } from "@cadence/contracts/note";
import { NoteSession, noteStatus, IDLE_SAVE_MS, NOTE_MAX_CHARS, type SessionDeps } from "../../../../app/lib/notes/note-session";
import type { DraftRecord, NoteJournal } from "../../../../app/lib/notes/note-journal";
import type { NoteSavePayload, WalEntry } from "../../../../app/lib/api/offline-wal";
import { ApiErrorResponse, networkError } from "../../../../app/types/api";

const note = (body: string, version: number): TaskNote => ({
    id: "n", taskId: "t", userId: "u", body, excerpt: "", wordCount: 0, headingCount: 0, version,
    createdAt: "2026-10-06T12:00:00.000Z", updatedAt: "2026-10-06T12:00:00.000Z",
});
const conflict = () => new ApiErrorResponse({ status: 409, code: "CONFLICT", message: "stale" });

function memoryJournal(): NoteJournal & { records: Map<string, DraftRecord>; failing: boolean } {
    const records = new Map<string, DraftRecord>();
    const j = {
        records,
        failing: false,
        put: async (_u: string, _o: string, r: DraftRecord) => { if (j.failing) throw new Error("full"); records.set(r.branch, r); },
        remove: async (_u: string, _o: string, b: string) => { records.delete(b); },
        list: async () => [...records.values()],
        owners: async () => [],
    };
    return j;
}

let server: TaskNote | null;
let sent: NoteSavePayload[];
let wal: WalEntry[];
let online: boolean;
let journal: ReturnType<typeof memoryJournal>;
let sendImpl: (p: NoteSavePayload) => Promise<TaskNote | undefined>;
let alive: Set<string>;
let n = 0;

function make(extra: Partial<SessionDeps> = {}) {
    const deps: SessionDeps = {
        userId: "u", ownerId: "t",
        fetchNote: async () => server,
        cachedNote: () => server,
        send: (p) => { sent.push(p); return sendImpl(p); },
        publish: () => {},
        announce: () => {},
        journal,
        walEntries: () => wal,
        subscribeWal: () => () => {},
        isOnline: () => online,
        branchAlive: async (b) => alive.has(b),
        holdBranch: () => () => {},
        newId: () => `id-${++n}`,
        ...extra,
    };
    return new NoteSession(deps);
}

/** A server that applies saves like the real route: version check, then bump. */
const applyToServer = async (p: NoteSavePayload) => {
    if ((p.expectedVersion ?? 0) !== (server?.version ?? 0)) throw conflict();
    server = note(p.body, (server?.version ?? 0) + 1);
    return server;
};

beforeEach(() => {
    vi.useFakeTimers();
    server = note("base", 1);
    sent = [];
    wal = [];
    online = true;
    journal = memoryJournal();
    alive = new Set();
    sendImpl = applyToServer;
});
afterEach(() => vi.useRealTimers());

const settle = () => vi.advanceTimersByTimeAsync(IDLE_SAVE_MS + 50);

describe("note session saving", () => {
    it("starts saved and sends nothing until the user edits", async () => {
        const s = make();
        await s.load();
        await settle();
        expect(s.status).toBe("saved");
        expect(sent).toHaveLength(0);
    });

    it("saves after the idle wait against the acknowledged revision", async () => {
        const s = make();
        await s.load();
        s.edit("base one");
        expect(s.status).toBe("saving");
        await settle();
        expect(sent).toMatchObject([{ body: "base one", expectedVersion: 1, baseBody: "base" }]);
        expect(s.status).toBe("saved");
    });

    it("doesn't call text typed during a save Saved, and sends it on the revision the save returned", async () => {
        let release!: () => void;
        sendImpl = (p) => new Promise((res, rej) => { release = () => applyToServer(p).then(res, rej); });
        const s = make();
        await s.load();
        s.edit("A");
        await settle();
        s.edit("AB");
        sendImpl = applyToServer;
        expect(s.status).toBe("saving");
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(s.getSnapshot().ackedGen).toBeGreaterThan(0);
        await settle();
        expect(sent.map((p) => [p.body, p.expectedVersion])).toEqual([["A", 1], ["AB", 2]]);
        expect(s.status).toBe("saved");
    });

    it("keeps every request in flight single-file", async () => {
        let inFlight = 0;
        let peak = 0;
        sendImpl = async (p) => { peak = Math.max(peak, ++inFlight); await Promise.resolve(); inFlight--; return applyToServer(p); };
        const s = make();
        await s.load();
        s.edit("1");
        const first = s.flush();
        s.edit("12");
        await Promise.all([first, s.flush()]);
        expect(peak).toBe(1);
        expect(server?.body).toBe("12");
    });

    it("gives each exact payload its own operation id", async () => {
        const s = make();
        await s.load();
        s.edit("x");
        await s.flush();
        s.edit("xy");
        await s.flush();
        expect(new Set(sent.map((p) => p.opId)).size).toBe(2);
    });

    it("checkpoints to the device within the journal window and clears it once saved", async () => {
        const s = make();
        await s.load();
        s.edit("draft");
        await vi.advanceTimersByTimeAsync(200);
        expect(journal.records.get(s.branch)?.body).toBe("draft");
        await settle();
        expect(journal.records.size).toBe(0);
    });

    it("brings back a draft a closed tab left, and saves it", async () => {
        journal.records.set("old", { branch: "old", baseBody: "base", baseVersion: 1, body: "base, unsaved", gen: 3, updatedAt: 1, kind: "draft" });
        const s = make();
        await s.load();
        expect(s.getSnapshot().body).toBe("base, unsaved");
        await settle();
        expect(server?.body).toBe("base, unsaved");
        expect(journal.records.has("old")).toBe(false);
    });

    it("leaves another live tab's draft alone", async () => {
        journal.records.set("other", { branch: "other", baseBody: "base", baseVersion: 1, body: "theirs", gen: 1, updatedAt: 1 });
        alive.add("other");
        const s = make();
        await s.load();
        expect(s.getSnapshot().body).toBe("base");
        expect(journal.records.has("other")).toBe(true);
    });

    it("never sends or truncates a body over 50,000 characters", async () => {
        const s = make();
        await s.load();
        const huge = "x".repeat(NOTE_MAX_CHARS + 1);
        s.edit(huge);
        await settle();
        expect(sent).toHaveLength(0);
        expect(s.getSnapshot().body).toBe(huge);
        s.edit("small");
        await settle();
        expect(server?.body).toBe("small");
    });
});

describe("offline and failures", () => {
  it("shows 'Saved on this device · Offline' only once the draft is on the device", async () => {
        online = false;
        sendImpl = async () => undefined;
        const s = make();
        await s.load();
        s.setOnline(false);
        s.edit("offline text");
        expect(s.status).toBe("saving");
        await settle();
        expect(s.status).toBe("device-offline");
        s.setOnline(true);
        expect(s.status).toBe("device-syncing");
    });

    it("reports Couldn't save when neither the device nor the server holds the text", async () => {
        journal.failing = true;
        sendImpl = async () => undefined;
        const s = make();
        await s.load();
        s.edit("x");
        await settle();
        expect(s.status).toBe("save-failed");
        expect(await s.flush()).toBe("failed");
    });

    it("retries a transient failure and reports Couldn't sync meanwhile", async () => {
        let fail = true;
        sendImpl = async (p) => { if (fail) throw networkError(); return applyToServer(p); };
        const s = make();
        await s.load();
        s.edit("x");
        await settle();
        expect(s.status).toBe("sync-failed");
        fail = false;
        await vi.advanceTimersByTimeAsync(2_100);
        expect(s.status).toBe("saved");
    });

    it("stops saving to a deleted note but keeps the text", async () => {
        sendImpl = async () => { throw new ApiErrorResponse({ status: 404, code: "NOT_FOUND", message: "gone" }); };
        const s = make();
        await s.load();
        s.edit("keep me");
        await settle();
        expect(s.getSnapshot().problem).toBe("deleted");
        expect(s.getSnapshot().body).toBe("keep me");
        expect(["sync-failed", "save-failed"]).toContain(s.status);
    });

    it("can't open an unavailable note as an empty document", async () => {
        const s = make({ fetchNote: async () => { throw networkError(); }, cachedNote: () => undefined });
        await s.load();
        expect(s.getSnapshot().loadFailed).toBe(true);
        expect(s.getSnapshot().loaded).toBe(false);
    });

    it("seeds legacy content only when the server has no note, without saving it", async () => {
        server = null;
        const s = make({ legacySeed: () => "old task text" });
        await s.load();
        await settle();
        expect(s.getSnapshot().body).toBe("old task text");
        expect(sent).toHaveLength(0);
        expect(s.status).toBe("saved");
    });
});

describe("other tabs, devices and conflicts", () => {
    it("adopts a newer server note when clean, without echoing a save", async () => {
        const s = make();
        await s.load();
        const seen: string[] = [];
        s.attachView("v", (b) => seen.push(b), () => null);
        s.receiveRemote(note("from another tab", 2));
        await settle();
        expect(seen).toEqual(["from another tab"]);
        expect(s.getSnapshot().body).toBe("from another tab");
        expect(sent).toHaveLength(0);
        expect(s.status).toBe("saved");
    });

    it("ignores stale and repeated announcements", async () => {
        const s = make();
        await s.load();
        const seen: string[] = [];
        s.attachView("v", (b) => seen.push(b), () => null);
        s.receiveRemote(note("old", 1));
        s.receiveRemote(note("new", 2));
        s.receiveRemote(note("new", 2));
        expect(seen).toEqual(["new"]);
    });

    it("merges edits to separate paragraphs from one base, once", async () => {
        server = note("one\n\ntwo\n\nthree", 1);
        const s = make();
        await s.load();
        s.edit("ONE\n\ntwo\n\nthree");
        // The other tab saves first.
        server = note("one\n\ntwo\n\nTHREE", 2);
        await settle();
        expect(server.body).toBe("ONE\n\ntwo\n\nTHREE");
        expect(server.version).toBe(3);
        expect(s.getSnapshot().body).toBe("ONE\n\ntwo\n\nTHREE");
        expect(s.status).toBe("saved");
    });

    it("pushes a remote edit into a dirty tab when the remote text equals its base", async () => {
        const s = make();
        await s.load();
        s.edit("base mine");
        s.receiveRemote(note("base", 2));
        expect(s.getSnapshot().body).toBe("base mine");
    });

    it("asks for review on overlapping edits, leaves the server note untouched, then lets either side win", async () => {
        const s = make();
        await s.load();
        s.edit("base mine");
        server = note("base theirs", 2);
        await settle();
        expect(s.status).toBe("review");
        expect(server.body).toBe("base theirs");
        expect(s.getSnapshot().conflict).toEqual({ remote: "base theirs", remoteVersion: 2 });
        expect(journal.records.get(s.branch)?.body).toBe("base mine");

        await s.useMine();
        await settle();
        expect(server.body).toBe("base mine");
        expect(s.getSnapshot().recovery?.body).toBe("base theirs");
        expect(s.status).toBe("saved");
    });

    it("on 'use latest' keeps my text as a recovery copy until discarded", async () => {
        const s = make();
        await s.load();
        s.edit("base mine");
        server = note("base theirs", 2);
        await settle();
        const seen: string[] = [];
        s.attachView("v", (b) => seen.push(b), () => null);
        await s.useLatest();
        expect(seen).toEqual(["base theirs"]);
        expect(s.getSnapshot().recovery?.body).toBe("base mine");
        expect([...journal.records.values()].some((r) => r.kind === "recovery")).toBe(true);
        await s.discardRecovery();
        expect(journal.records.size).toBe(0);
    });

    it("recovers an overlap with the first note two tabs created at once", async () => {
        server = null;
        const s = make();
        await s.load();
        s.edit("tab A");
        server = note("tab B", 1);
        await settle();
        expect(s.status).toBe("review");
    });

    it("pulls text a view hasn't reported yet when it unmounts", async () => {
        const s = make();
        await s.load();
        let pending: string | null = "typed just now";
        const detach = s.attachView("v", () => {}, () => pending);
        detach();
        await s.flush();
        expect(server?.body).toBe("typed just now");
    });
});

describe("status table", () => {
    const base = { loaded: true, loadFailed: false, body: "", baseBody: "", baseVersion: 0, gen: 0, ackedGen: 0, durableGen: 0, journalFailed: false, sending: false, queued: false, problem: null, conflict: null, recovery: null, online: true } as const;
    it("covers each row", () => {
        expect(noteStatus({ ...base, loaded: false })).toBe("loading");
        expect(noteStatus(base)).toBe("saved");
        expect(noteStatus({ ...base, gen: 2, ackedGen: 1 })).toBe("saving");
        expect(noteStatus({ ...base, gen: 2, ackedGen: 1, durableGen: 2, queued: true, online: false })).toBe("device-offline");
        expect(noteStatus({ ...base, gen: 2, ackedGen: 1, durableGen: 1, queued: true, online: false })).toBe("save-failed");
        expect(noteStatus({ ...base, gen: 2, ackedGen: 1, durableGen: 2, problem: "network" })).toBe("sync-failed");
        expect(noteStatus({ ...base, gen: 2, ackedGen: 1, conflict: { remote: "", remoteVersion: 1 } })).toBe("review");
    });
});
