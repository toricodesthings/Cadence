/**
 * One note session per account + canonical note owner, per tab. It owns the text's
 * generations, the acknowledged revision, durability and the one in-flight save, so the
 * writing room and the task panel see one truth. Editors only own their selection.
 *
 * Plain TypeScript with injected dependencies (React and the network live elsewhere),
 * so every save and sync rule here is unit-testable with fake timers.
 */
import type { TaskNote } from "@cadence/contracts/note";
import type { NoteSavePayload, WalEntry } from "../api/offline-wal";
import { ApiErrorResponse, isNetworkFailure } from "../../types/api";
import type { DraftRecord, NoteJournal } from "./note-journal";
import { reconcileNote } from "./note-reconcile";

export const NOTE_MAX_CHARS = 50_000;
/** Initial tuning targets (0.28.0 plan §4): local checkpoint, idle save, longest wait while typing. */
export const JOURNAL_MS = 150;
export const IDLE_SAVE_MS = 600;
export const MAX_WAIT_MS = 2_000;
const RETRY_MS = [2_000, 5_000, 15_000, 60_000];

export type NoteStatus =
    | "loading"
    | "saved"
    | "saving"
    | "device-offline"
    | "device-syncing"
    | "sync-failed"
    | "review"
    | "save-failed";

export type NoteProblem = "auth" | "deleted" | "invalid" | "network" | "server" | null;

export interface NoteSessionState {
    loaded: boolean;
    loadFailed: boolean;
    body: string;
    /** Last text/revision the server acknowledged (0 = no note yet). */
    baseBody: string;
    baseVersion: number;
    /** Counts local edits; `ackedGen` is the newest one the server (or the queue's reconcile) holds. */
    gen: number;
    ackedGen: number;
    /** Newest generation written to this device's journal. */
    durableGen: number;
    journalFailed: boolean;
    sending: boolean;
    /** The latest text sits in the offline queue. */
    queued: boolean;
    problem: NoteProblem;
    /** Both versions, when edits overlap and nothing was guessed. */
    conflict: { remote: string; remoteVersion: number } | null;
    /** A version set aside by a choice, kept until discarded. */
    recovery: { body: string; at: number } | null;
    online: boolean;
}

/** The one status the user sees (the table in the plan §4), derived, never stored. */
export function noteStatus(s: NoteSessionState): NoteStatus {
    if (!s.loaded) return "loading";
    if (s.conflict) return "review";
    if (s.gen === s.ackedGen) return "saved";
    const device = s.durableGen === s.gen && !s.journalFailed;
    if (s.problem === "deleted" || s.problem === "invalid" || (s.problem && !device)) return device ? "sync-failed" : "save-failed";
    if (s.problem) return "sync-failed";
    if (s.queued) return device ? (s.online ? "device-syncing" : "device-offline") : "save-failed";
    if (!s.online && device) return "device-offline";
    return "saving";
}

export interface SessionDeps {
    userId: string;
    ownerId: string;
    /** Fresh from the server. */
    fetchNote: () => Promise<TaskNote | null>;
    /** What the query cache holds, for editing offline; `undefined` = never loaded. */
    cachedNote: () => TaskNote | null | undefined;
    /** Offline-aware save: `undefined` means it was queued for later. */
    send: (payload: NoteSavePayload) => Promise<TaskNote | undefined>;
    publish: (note: TaskNote | null | ((old: TaskNote | null | undefined) => TaskNote | null | undefined)) => void;
    announce: (message: { owner: string; version: number; opId?: string }) => void;
    journal: NoteJournal;
    walEntries: () => WalEntry[];
    subscribeWal: (cb: () => void) => () => void;
    isOnline: () => boolean;
    /** Holds a lock for as long as this tab lives; resolves `true` while another tab's branch is still alive. */
    branchAlive: (branch: string) => Promise<boolean>;
    holdBranch: (branch: string) => () => void;
    /** Legacy `task.content`, used only when the server has no dedicated note. */
    legacySeed?: () => string;
    newId?: () => string;
}

export type FlushResult = "saved" | "held" | "failed";
type Listener = () => void;
type ExternalListener = (body: string) => void;

export class NoteSession {
    readonly branch: string;
    private state: NoteSessionState;
    private listeners = new Set<Listener>();
    private views = new Map<string, ExternalListener>();
    private serializers = new Map<string, () => string | null>();
    private journalTimer: ReturnType<typeof setTimeout> | undefined;
    private saveTimer: ReturnType<typeof setTimeout> | undefined;
    private retryTimer: ReturnType<typeof setTimeout> | undefined;
    private firstDirtyAt = 0;
    private driving: Promise<void> | null = null;
    private driveAgain = false;
    private journalRun: Promise<void> | null = null;
    private retries = 0;
    private seenOps = new Set<string>();
    private releaseBranch: () => void = () => {};
    private unsubscribeWal: () => void = () => {};
    private disposed = false;
    private loading: Promise<void> | null = null;

    constructor(private deps: SessionDeps) {
        this.branch = (deps.newId ?? (() => crypto.randomUUID()))();
        this.state = {
            loaded: false, loadFailed: false, body: "", baseBody: "", baseVersion: 0,
            gen: 0, ackedGen: 0, durableGen: 0, journalFailed: false,
            sending: false, queued: false, problem: null, conflict: null, recovery: null,
            online: deps.isOnline(),
        };
    }

    // ── subscription ──

    subscribe = (cb: Listener) => {
        this.listeners.add(cb);
        return () => this.listeners.delete(cb);
    };
    getSnapshot = () => this.state;
    get status(): NoteStatus {
        return noteStatus(this.state);
    }
    get owner() {
        return this.deps.ownerId;
    }
    get userId() {
        return this.deps.userId;
    }
    get hasUnsavedWork() {
        return this.state.gen !== this.state.ackedGen || this.state.recovery !== null;
    }

    private set(patch: Partial<NoteSessionState>) {
        this.state = { ...this.state, ...patch };
        for (const l of this.listeners) l();
    }

    /** An editor view registers to receive text that changed outside it (other tab, merge, choice). */
    attachView(id: string, onExternal: ExternalListener, serialize: () => string | null) {
        this.views.set(id, onExternal);
        this.serializers.set(id, serialize);
        return () => {
            // Unmounting must not lose the newest keystrokes.
            this.pullFromViews();
            this.views.delete(id);
            this.serializers.delete(id);
        };
    }

    /** Ask editors for text they haven't reported yet (serialization is debounced in the editor). */
    private pullFromViews() {
        for (const [id, serialize] of this.serializers) {
            const text = serialize();
            if (text !== null && text !== this.state.body) this.edit(text, id);
        }
    }

    private tellViews(body: string, except?: string) {
        for (const [id, cb] of this.views) if (id !== except) cb(body);
    }

    // ── loading ──

    load(): Promise<void> {
        return (this.loading ??= this.doLoad());
    }

    private async doLoad() {
        this.releaseBranch = this.deps.holdBranch(this.branch);
        let note: TaskNote | null | undefined;
        try {
            note = await this.deps.fetchNote();
        } catch {
            note = this.deps.cachedNote();
        }
        if (this.disposed) return;
        if (note === undefined) return this.set({ loadFailed: true });

        const body = note?.body ?? this.deps.legacySeed?.() ?? "";
        this.state = { ...this.state, loaded: true, loadFailed: false, body, baseBody: note?.body ?? "", baseVersion: note?.version ?? 0 };
        await this.recoverEarlierDrafts();
        this.unsubscribeWal = this.deps.subscribeWal(() => void this.onWalChange());
        this.set({});
        void this.onWalChange();
        if (this.state.gen !== this.state.ackedGen) this.scheduleSave();
    }

    /** Drafts a closed or crashed tab left behind (or a recovery copy): fold them in by the same rules as a remote edit. */
    private async recoverEarlierDrafts() {
        let records: DraftRecord[] = [];
        try {
            records = await this.deps.journal.list(this.deps.userId, this.deps.ownerId);
        } catch {
            return;
        }
        for (const record of records) {
            if (record.branch === this.branch) continue;
            if (record.kind === "recovery") {
                this.state = { ...this.state, recovery: { body: record.body, at: record.updatedAt } };
                continue;
            }
            if (await this.deps.branchAlive(record.branch)) continue;
            // A draft already in the offline queue is the queue's to deliver.
            if (this.deps.walEntries().some((e) => e.op.type === "upsert_note" && e.op.taskId === this.deps.ownerId && e.op.payload.branch === record.branch)) continue;
            if (record.body !== this.state.body || record.baseVersion !== this.state.baseVersion) {
                this.adoptDraft(record);
            }
            await this.deps.journal.remove(this.deps.userId, this.deps.ownerId, record.branch).catch(() => {});
        }
    }

    private adoptDraft(record: DraftRecord) {
        const s = this.state;
        if (record.body === s.body) return;
        const outcome = s.gen === s.ackedGen
            ? reconcileNote(record.baseBody, record.body, s.body)
            : reconcileNote(s.baseBody, s.body, record.body);
        if (record.baseVersion === s.baseVersion && s.gen === s.ackedGen) {
            // Nothing newer on the server: the draft simply continues.
            this.state = { ...this.state, body: record.body, gen: s.gen + 1 };
        } else if (outcome.kind === "merged") {
            this.state = { ...this.state, body: outcome.body, gen: s.gen + 1 };
        } else if (outcome.kind === "conflict") {
            this.state = { ...this.state, conflict: { remote: s.body, remoteVersion: s.baseVersion }, body: record.body, gen: s.gen + 1 };
        }
    }

    // ── editing ──

    /** A local edit from an editor view. */
    edit(body: string, view?: string) {
        if (!this.state.loaded || body === this.state.body) return;
        if (!this.firstDirtyAt) this.firstDirtyAt = Date.now();
        this.set({ body, gen: this.state.gen + 1, problem: this.state.problem === "network" ? null : this.state.problem });
        this.tellViews(body, view);
        this.scheduleJournal();
        this.scheduleSave();
    }

    private scheduleJournal() {
        if (this.journalTimer) return;
        this.journalTimer = setTimeout(() => {
            this.journalTimer = undefined;
            void this.writeJournal();
        }, JOURNAL_MS);
    }

    /** One journal write at a time; it loops until the newest generation is down, so a caller can await "everything so far". */
    private writeJournal(): Promise<void> {
        return (this.journalRun ??= (async () => {
            try {
                for (;;) {
                    const { gen, body, baseBody, baseVersion } = this.state;
                    if (gen === this.state.ackedGen) {
                        await this.deps.journal.remove(this.deps.userId, this.deps.ownerId, this.branch);
                    } else {
                        await this.deps.journal.put(this.deps.userId, this.deps.ownerId, { branch: this.branch, baseBody, baseVersion, body, gen, updatedAt: Date.now(), kind: "draft" });
                    }
                    this.set({ durableGen: gen, journalFailed: false });
                    if (this.state.gen === gen) break;
                }
            } catch {
                this.set({ journalFailed: true });
            } finally {
                this.journalRun = null;
            }
        })());
    }

    private scheduleSave() {
        clearTimeout(this.saveTimer);
        const waited = Date.now() - this.firstDirtyAt;
        this.saveTimer = setTimeout(() => void this.drive(), Math.max(0, Math.min(IDLE_SAVE_MS, MAX_WAIT_MS - waited)));
    }

    // ── saving (one request at a time) ──

    /**
     * Save now, skipping the idle wait. "saved": the server has the latest text.
     * "held": it's safe on this device and queued. "failed": neither (stay and recover).
     */
    async flush(): Promise<FlushResult> {
        this.pullFromViews();
        clearTimeout(this.saveTimer);
        clearTimeout(this.retryTimer);
        this.retries = 0;
        await this.writeJournal();
        await this.drive();
        const s = this.state;
        if (s.gen === s.ackedGen) return "saved";
        return s.durableGen === s.gen && !s.journalFailed ? "held" : "failed";
    }

    private drive(): Promise<void> {
        this.pullFromViews();
        if (this.driving) {
            this.driveAgain = true;
            return this.driving;
        }
        this.driving = (async () => {
            try {
                do {
                    this.driveAgain = false;
                    await this.saveLoop();
                } while (this.driveAgain);
            } finally {
                this.driving = null;
            }
        })();
        return this.driving;
    }

    private async saveLoop() {
        for (;;) {
            const s = this.state;
            if (!s.loaded || s.gen === s.ackedGen || s.conflict) return;
            if (s.body.length > NOTE_MAX_CHARS) return; // never truncated, never sent; the user reduces or exports it
            if (s.problem === "deleted" || s.problem === "invalid" || s.problem === "auth") return;
            if (this.waitsForQueue()) return this.set({ queued: true });

            const snapshot = { body: s.body, gen: s.gen };
            const payload: NoteSavePayload = {
                body: snapshot.body,
                expectedVersion: s.baseVersion,
                branch: this.branch,
                baseBody: s.baseBody,
                opId: (this.deps.newId ?? (() => crypto.randomUUID()))(),
            };
            this.set({ sending: true });
            try {
                const note = await this.deps.send(payload);
                if (!note) {
                    this.firstDirtyAt = 0;
                    this.set({ sending: false, queued: true, problem: null });
                    return;
                }
                this.acknowledge(note, snapshot.gen);
                this.deps.announce({ owner: this.deps.ownerId, version: note.version, opId: payload.opId });
            } catch (error) {
                this.set({ sending: false });
                if (await this.onSaveError(error)) continue;
                return;
            }
        }
    }

    private acknowledge(note: TaskNote, gen: number) {
        this.retries = 0;
        this.seenOps.add(`${note.version}`);
        this.deps.publish((old) => ({ ...(old ?? note), ...note }));
        this.set({ sending: false, queued: false, problem: null, baseBody: note.body, baseVersion: note.version, ackedGen: Math.max(this.state.ackedGen, gen) });
        if (this.state.gen === this.state.ackedGen) {
            this.firstDirtyAt = 0;
            this.scheduleJournal();
        }
    }

    /** True to go around again immediately (merged), false to stop. */
    private async onSaveError(error: unknown): Promise<boolean> {
        if (error instanceof ApiErrorResponse) {
            if (error.status === 409) return this.onConflict();
            if (error.isAuthError) return this.fail("auth");
            if (error.status === 404) return this.fail("deleted");
            if (error.status === 400 || error.status === 422) return this.fail("invalid");
            return this.retryLater(error.retryAfterSeconds, error.isRetryable || error.status >= 500 || error.isRateLimited ? "server" : "invalid");
        }
        return this.retryLater(undefined, isNetworkFailure(error) ? "network" : "server");
    }

    private fail(problem: NoteProblem) {
        this.set({ problem });
        return false;
    }

    private retryLater(retryAfterSeconds: number | undefined, problem: NoteProblem) {
        if (problem === "invalid") return this.fail(problem);
        this.set({ problem });
        const delay = Math.max((retryAfterSeconds ?? 0) * 1000, RETRY_MS[Math.min(this.retries++, RETRY_MS.length - 1)]);
        clearTimeout(this.retryTimer);
        this.retryTimer = setTimeout(() => void this.drive(), delay);
        return false;
    }

    /** Another edit landed first: settle it by fetching the truth (never by guessing). */
    private async onConflict(): Promise<boolean> {
        let remote: TaskNote | null;
        try {
            remote = await this.deps.fetchNote();
        } catch (error) {
            return this.onSaveError(error);
        }
        return this.settleAgainst(remote);
    }

    private settleAgainst(remote: TaskNote | null): boolean {
        const s = this.state;
        const remoteBody = remote?.body ?? "";
        const remoteVersion = remote?.version ?? 0;
        const outcome = reconcileNote(s.baseBody, s.body, remoteBody);
        if (outcome.kind === "same") {
            if (remote) this.acknowledge(remote, s.gen);
            return false;
        }
        if (outcome.kind === "merged" && outcome.body.length <= NOTE_MAX_CHARS) {
            this.set({ body: outcome.body, gen: s.gen + 1, baseBody: remoteBody, baseVersion: remoteVersion, problem: null });
            this.tellViews(outcome.body);
            this.scheduleJournal();
            return true;
        }
        this.set({ conflict: { remote: remoteBody, remoteVersion }, problem: null });
        void this.writeJournal();
        return false;
    }

    /** While the queue holds an earlier request for this branch that may already have reached the server, wait for it. */
    private waitsForQueue(): boolean {
        return this.deps.walEntries().some((e) =>
            e.op.type === "upsert_note" && e.op.taskId === this.deps.ownerId && e.op.payload.branch === this.branch
            && (e.attempted || e.status === "replaying" || e.conflict));
    }

    // ── the offline queue ──

    private async onWalChange() {
        const mine = this.deps.walEntries().filter((e) => e.op.type === "upsert_note" && e.op.taskId === this.deps.ownerId);
        const ours = mine.find((e) => e.op.type === "upsert_note" && e.op.payload.branch === this.branch);
        const s = this.state;
        if (ours?.conflict && !s.conflict) {
            let remote: TaskNote | null = null;
            try {
                remote = await this.deps.fetchNote();
            } catch {
                return;
            }
            this.set({ conflict: { remote: remote?.body ?? "", remoteVersion: remote?.version ?? 0 }, queued: true });
            return;
        }
        if (ours?.status === "failed" && !ours.conflict) return this.set({ queued: true, problem: "network" });
        if (!ours && s.queued) {
            // The queue delivered it (or dropped a deleted parent): learn the server's truth.
            let remote: TaskNote | null;
            try {
                remote = await this.deps.fetchNote();
            } catch {
                return;
            }
            this.set({ queued: false });
            if (!remote) return void this.fail("deleted");
            this.receiveRemote(remote);
            if (this.state.gen !== this.state.ackedGen) this.scheduleSave();
        } else if (ours) {
            this.set({ queued: true, online: this.deps.isOnline() });
        }
    }

    // ── changes from elsewhere ──

    /** Fresh server data (poll, focus, reconnect, another tab's announcement). Never triggers a save echo. */
    receiveRemote(note: TaskNote | null) {
        if (note && note.version > this.state.baseVersion) this.pullFromViews(); // text typed a moment ago counts as local
        const s = this.state;
        if (!s.loaded || !note || note.version <= s.baseVersion) return;
        if (s.sending) return; // the response (or its 409) settles it
        if (s.gen === s.ackedGen) {
            this.set({ body: note.body, baseBody: note.body, baseVersion: note.version, gen: s.gen + 1, ackedGen: s.gen + 1, durableGen: s.gen + 1 });
            if (note.body !== s.body) this.tellViews(note.body);
            return;
        }
        if (s.queued) return; // our queued save will meet this as a conflict and reconcile there
        if (this.settleAgainst(note)) this.scheduleSave();
    }

    setOnline(online: boolean) {
        if (online === this.state.online) return;
        this.set({ online });
        if (online) {
            this.retries = 0;
            void this.drive();
        }
    }

    // ── conflict choices ──

    /** Keep my text: it saves on top of the latest version. The latest stays recoverable. */
    async useMine() {
        const c = this.state.conflict;
        if (!c) return;
        await this.keepRecovery(c.remote);
        this.dropQueuedEntryFor(); // the queued copy would repeat the old base
        this.set({ conflict: null, baseBody: c.remote, baseVersion: c.remoteVersion, gen: this.state.gen + 1, queued: false });
        void this.flush();
    }

    /** Use the latest: my text is set aside as a recovery copy until discarded. */
    async useLatest() {
        const c = this.state.conflict;
        if (!c) return;
        await this.keepRecovery(this.state.body);
        this.dropQueuedEntryFor();
        const gen = this.state.gen + 1;
        this.set({ conflict: null, body: c.remote, baseBody: c.remote, baseVersion: c.remoteVersion, gen, ackedGen: gen, durableGen: gen, queued: false });
        this.tellViews(c.remote);
        void this.writeJournal();
    }

    private dropQueuedEntryFor() {
        // The caller removes the WAL entry through `discardQueued` (set by the hook layer).
        this.discardQueued?.(this.branch);
    }
    discardQueued?: (branch: string) => void;

    private async keepRecovery(body: string) {
        const record: DraftRecord = { branch: `recovery-${this.branch}`, baseBody: "", baseVersion: 0, body, gen: 0, updatedAt: Date.now(), kind: "recovery" };
        this.set({ recovery: { body, at: record.updatedAt } });
        await this.deps.journal.put(this.deps.userId, this.deps.ownerId, record).catch(() => {});
    }

    async discardRecovery() {
        this.set({ recovery: null });
        const records = await this.deps.journal.list(this.deps.userId, this.deps.ownerId).catch(() => [] as DraftRecord[]);
        for (const r of records) if (r.kind === "recovery") await this.deps.journal.remove(this.deps.userId, this.deps.ownerId, r.branch).catch(() => {});
    }

    /** Put the recovery copy back as an edit. */
    restoreRecovery() {
        const r = this.state.recovery;
        if (!r) return;
        this.edit(r.body);
        this.tellViews(r.body);
        void this.discardRecovery();
    }

    /** Write the latest text to this device now. `true` once nothing newer than the server or the journal is missing. */
    async persist(): Promise<boolean> {
        this.pullFromViews();
        clearTimeout(this.journalTimer);
        this.journalTimer = undefined;
        await this.writeJournal();
        const s = this.state;
        return s.gen === s.ackedGen || (s.durableGen === s.gen && !s.journalFailed);
    }

    /** Persist and send what's pending (room closed, tab hidden). Never awaits the network. */
    checkpoint() {
        this.pullFromViews();
        clearTimeout(this.journalTimer);
        this.journalTimer = undefined;
        void this.writeJournal();
        clearTimeout(this.saveTimer);
        void this.drive();
    }

    dispose() {
        this.disposed = true;
        clearTimeout(this.journalTimer);
        clearTimeout(this.saveTimer);
        clearTimeout(this.retryTimer);
        this.unsubscribeWal();
        this.releaseBranch();
    }
}
