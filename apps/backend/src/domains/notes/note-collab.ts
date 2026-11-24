import * as Y from "yjs";
import type { Connection, ConnectionContext } from "partyserver";
import { YServer } from "y-partyserver";
import type { ListRole } from "@cadence/contracts/sharing";
import type { Env } from "../../types/env";
import { getDbClient } from "../../platform/db";
import { AppError } from "../../platform/errors";
import { taskAccess } from "../../platform/list-access";
import { withRls } from "../../platform/rls";
import { logger, issuesFromError } from "../../platform/log";
import { authenticateWsRequest, refuseWs, WS_CLOSE } from "../../platform/ws-auth";
import { writeNote } from "./notes.service";

export const NOTE_COLLAB_PATH_RE = /^\/api\/v1\/notes\/([0-9a-f-]{36})\/collab$/i;
export const NOTE_COLLAB_PROTOCOL = "cadence.collab";
const MAX_SNAPSHOT_CHARS = 50_000;

const HDR_USER = "X-Collab-User";
const HDR_ROLE = "X-Collab-Role";
const HDR_OWNER = "X-Collab-Owner";
const HDR_TASK = "X-Collab-Task";

interface CollabConnState {
    userId: string;
    role: ListRole;
    ownerId: string;
    taskId: string;
}

/**
 * Per-note collaborative editing Durable Object (`y-partyserver` / Yjs).
 * Persists binary Yjs updates in DO SQLite and flushes debounced Markdown snapshots
 * to Postgres `task_notes`, replacing last-write-wins and 409 conflicts for shared notes.
 */
export class NoteCollab extends YServer {
    static callbackOptions = { debounceWait: 2000, debounceMaxWait: 10_000 };

    private pendingMarkdown: string | null = null;
    private pendingUpdatedBy: string | null = null;
    private ownerId: string | null = null;
    private taskId: string | null = null;

    constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            this.ctx.storage.sql.exec(`
                CREATE TABLE IF NOT EXISTS note_state (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    yjs_update BLOB,
                    markdown TEXT,
                    owner_id TEXT,
                    task_id TEXT,
                    updated_by TEXT
                )
            `);
        });
    }

    isReadOnly(connection: Connection): boolean {
        const state = connection.state as CollabConnState | null;
        return state?.role === "view";
    }

    async onLoad(): Promise<void> {
        const rows = this.ctx.storage.sql
            .exec<{ yjs_update: ArrayBuffer | null; owner_id: string | null; task_id: string | null }>(
                "SELECT yjs_update, owner_id, task_id FROM note_state WHERE id = 1",
            )
            .toArray();
        const row = rows[0];
        if (!row) return;
        if (row.owner_id) this.ownerId = row.owner_id;
        if (row.task_id) this.taskId = row.task_id;
        if (row.yjs_update && row.yjs_update.byteLength > 0) {
            Y.applyUpdate(this.document, new Uint8Array(row.yjs_update));
        }
    }

    async onConnect(connection: Connection, ctx: ConnectionContext): Promise<void> {
        const userId = ctx.request.headers.get(HDR_USER) ?? "";
        const role = (ctx.request.headers.get(HDR_ROLE) as ListRole | null) ?? "view";
        const ownerId = ctx.request.headers.get(HDR_OWNER) ?? "";
        const taskId = ctx.request.headers.get(HDR_TASK) ?? this.name;
        connection.setState({ userId, role, ownerId, taskId } satisfies CollabConnState);
        if (ownerId) this.ownerId = ownerId;
        if (taskId) this.taskId = taskId;
        await super.onConnect(connection, ctx);
    }

    onCustomMessage(connection: Connection, message: string): void {
        if (this.isReadOnly(connection)) return;
        let parsed: unknown;
        try {
            parsed = JSON.parse(message);
        } catch {
            return;
        }
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            (parsed as { type?: unknown }).type === "snapshot" &&
            typeof (parsed as { markdown?: unknown }).markdown === "string"
        ) {
            const markdown = (parsed as { markdown: string }).markdown;
            if (markdown.length > MAX_SNAPSHOT_CHARS) return;
            const state = connection.state as CollabConnState | null;
            this.pendingMarkdown = markdown;
            this.pendingUpdatedBy = state?.userId ?? this.ownerId;
            if (state?.ownerId) this.ownerId = state.ownerId;
            if (state?.taskId) this.taskId = state.taskId;
        }
    }

    async onSave(): Promise<void> {
        const update = Y.encodeStateAsUpdate(this.document);
        this.ctx.storage.sql.exec(
            `INSERT INTO note_state (id, yjs_update, markdown, owner_id, task_id, updated_by)
             VALUES (1, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               yjs_update = excluded.yjs_update,
               markdown = COALESCE(excluded.markdown, note_state.markdown),
               owner_id = COALESCE(excluded.owner_id, note_state.owner_id),
               task_id = COALESCE(excluded.task_id, note_state.task_id),
               updated_by = COALESCE(excluded.updated_by, note_state.updated_by)`,
            update,
            this.pendingMarkdown,
            this.ownerId,
            this.taskId,
            this.pendingUpdatedBy,
        );

        if (this.pendingMarkdown !== null && this.ownerId && this.taskId) {
            const markdown = this.pendingMarkdown;
            const actorId = this.pendingUpdatedBy ?? this.ownerId;
            const ownerId = this.ownerId;
            const taskId = this.taskId;
            this.pendingMarkdown = null;
            const db = getDbClient(this.env as unknown as Env);
            try {
                await withRls(db, actorId, (tx) => writeNote(tx, ownerId, taskId, markdown));
            } catch (err) {
                // Only restore if no newer snapshot arrived while this flush was in flight.
                if (this.pendingMarkdown === null) this.pendingMarkdown = markdown;
                logger.warn("http", "note_collab_snapshot_failed", { issues: issuesFromError(err) });
            } finally {
                await db.$client.end({ timeout: 1 }).catch(() => {});
            }
        }
    }

    /** Called when REST or an assistant tool updates `task_notes` directly so clients re-seed cleanly. */
    async resetFromExternal(): Promise<void> {
        this.pendingMarkdown = null;
        this.ctx.storage.sql.exec("DELETE FROM note_state WHERE id = 1");
        // Clear the warm in-memory Y.Doc too so reconnecting clients re-seed from Postgres instead of stale memory.
        this.document.transact(() => {
            const frag = this.document.getXmlFragment("default");
            if (frag.length > 0) frag.delete(0, frag.length);
            this.document.getMap("meta").delete("seeded");
        });
        for (const ws of this.ctx.getWebSockets()) {
            try {
                ws.close(WS_CLOSE.reload, "updated");
            } catch {
                // Already closed.
            }
        }
    }

    /** Close active collab sockets for a removed or downgraded user so they immediately lose access. */
    async evict(userId: string): Promise<void> {
        for (const conn of this.getConnections()) {
            const state = conn.state as CollabConnState | null;
            if (state?.userId === userId) {
                try {
                    conn.close(WS_CLOSE.forbidden, "revoked");
                } catch {
                    // Already closed.
                }
            }
        }
    }

    /** Close all collab sockets on this note (stop sharing, transfer, or delete). */
    async closeAll(): Promise<void> {
        for (const ws of this.ctx.getWebSockets()) {
            try {
                ws.close(WS_CLOSE.forbidden, "unshared");
            } catch {
                // Already closed.
            }
        }
    }
}

/** `GET /api/v1/notes/:taskId/collab` (WebSocket). Verifies JWT + task membership before forwarding to `NoteCollab`. */
export async function connectNoteCollab(request: Request, env: Env, taskId: string): Promise<Response> {
    const auth = await authenticateWsRequest(request, env, NOTE_COLLAB_PROTOCOL);
    if (!auth.ok) return auth.response;
    if (!env.NOTE_COLLAB) return refuseWs(NOTE_COLLAB_PROTOCOL, WS_CLOSE.error, "unavailable");

    const { userId } = auth;
    let role: ListRole = "owner";
    let ownerId = userId;
    try {
        const access = await withRls(getDbClient(env), userId, (tx) => taskAccess(tx, userId, taskId));
        if (!access) return refuseWs(NOTE_COLLAB_PROTOCOL, WS_CLOSE.forbidden, "not shared");
        role = access.role;
        ownerId = access.ownerId;
    } catch (err) {
        if (err instanceof AppError && (err.statusCode === 403 || err.statusCode === 404)) {
            return refuseWs(NOTE_COLLAB_PROTOCOL, WS_CLOSE.forbidden, "not a member");
        }
        return refuseWs(NOTE_COLLAB_PROTOCOL, WS_CLOSE.error, "unavailable");
    }

    const headers = new Headers(request.headers);
    headers.set(HDR_USER, userId);
    headers.set(HDR_ROLE, role);
    headers.set(HDR_OWNER, ownerId);
    headers.set(HDR_TASK, taskId);
    headers.set("x-partykit-room", taskId);
    headers.set("x-partykit-namespace", "note-collab");

    const res = await env.NOTE_COLLAB.get(env.NOTE_COLLAB.idFromName(taskId)).fetch(new Request(request, { headers }));
    if (res.status === 101 && res.webSocket) {
        return new Response(null, {
            status: 101,
            webSocket: res.webSocket,
            headers: { "Sec-WebSocket-Protocol": NOTE_COLLAB_PROTOCOL },
        });
    }
    return res;
}

/** Best-effort reset of a note's collab DO after an external REST or AI write (never throws). */
export async function resetNoteCollab(env: Env, taskId: string): Promise<void> {
    if (!env.NOTE_COLLAB) return;
    try {
        await env.NOTE_COLLAB.get(env.NOTE_COLLAB.idFromName(taskId)).resetFromExternal();
    } catch (err) {
        logger.warn("http", "note_collab_reset_failed", { issues: issuesFromError(err) });
    }
}

/** Best-effort eviction of a user (or everyone) from active collab notes in a list. */
export async function evictFromNoteCollab(env: Env, taskIds: string[], userId?: string): Promise<void> {
    if (!env.NOTE_COLLAB || taskIds.length === 0) return;
    await Promise.all(
        taskIds.map(async (taskId) => {
            try {
                const stub = env.NOTE_COLLAB!.get(env.NOTE_COLLAB!.idFromName(taskId));
                if (userId) await stub.evict(userId);
                else await stub.closeAll();
            } catch (err) {
                logger.warn("http", "note_collab_evict_failed", { issues: issuesFromError(err) });
            }
        }),
    );
}
