import { WS_CLOSE } from "@cadence/contracts/live";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../../types/env";
import { getDbClient } from "../../platform/db";
import { AppError } from "../../platform/errors";
import { listAccess } from "../../platform/list-access";
import { withRls } from "../../platform/rls";
import { logger, issuesFromError } from "../../platform/log";
import { authenticateWsRequest, refuseWs } from "../../platform/ws-auth";

export const PRESENCE_PATH_RE = /^\/api\/v1\/lists\/([0-9a-f-]{36})\/presence$/i;
export const PRESENCE_PROTOCOL = "cadence.presence";
const USER_HEADER = "X-Presence-User";

export class ListPresence extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    }

    async fetch(request: Request): Promise<Response> {
        const userId = request.headers.get(USER_HEADER);
        if (!userId) return new Response("Missing user", { status: 400 });

        const { 0: client, 1: server } = new WebSocketPair();
        this.ctx.acceptWebSocket(server, [userId]);
        this.broadcast();
        return new Response(null, {
            status: 101,
            webSocket: client,
            headers: { "Sec-WebSocket-Protocol": PRESENCE_PROTOCOL },
        });
    }

    webSocketMessage(): void {}

    webSocketClose(ws: WebSocket, code: number): void {
        try {
            ws.close(code, "");
        } catch {}
        this.broadcast(ws);
    }

    webSocketError(ws: WebSocket): void {
        try {
            ws.close(WS_CLOSE.error, "");
        } catch {}
        this.broadcast(ws);
    }

    async evict(userId: string): Promise<void> {
        const evicted = new Set(this.ctx.getWebSockets(userId));
        for (const ws of evicted) {
            try {
                ws.close(WS_CLOSE.forbidden, "removed");
            } catch {}
        }
        if (evicted.size > 0) this.broadcast(evicted);
    }

    async closeAll(): Promise<void> {
        for (const ws of this.ctx.getWebSockets()) {
            try {
                ws.close(WS_CLOSE.forbidden, "unshared");
            } catch {}
        }
    }

    onlineUserIds(exclude?: WebSocket | Set<WebSocket>): string[] {
        const excluded = exclude instanceof Set ? exclude : exclude ? new Set([exclude]) : undefined;
        const ids = new Set<string>();
        for (const ws of this.ctx.getWebSockets()) {
            if (excluded?.has(ws)) continue;
            const tag = this.ctx.getTags(ws)[0];
            if (tag) ids.add(tag);
        }
        return [...ids];
    }

    private broadcast(exclude?: WebSocket | Set<WebSocket>): void {
        const excluded = exclude instanceof Set ? exclude : exclude ? new Set([exclude]) : undefined;
        const payload = JSON.stringify({ type: "presence", userIds: this.onlineUserIds(excluded) });
        for (const ws of this.ctx.getWebSockets()) {
            if (excluded?.has(ws)) continue;
            try {
                ws.send(payload);
            } catch {}
        }
    }
}

export async function connectPresence(request: Request, env: Env, listId: string): Promise<Response> {
    const auth = await authenticateWsRequest(request, env, PRESENCE_PROTOCOL);
    if (!auth.ok) return auth.response;
    if (!env.LIST_PRESENCE) return refuseWs(PRESENCE_PROTOCOL, WS_CLOSE.error, "unavailable");

    try {
        await withRls(getDbClient(env), auth.userId, (tx) => listAccess(tx, auth.userId, listId));
    } catch (err) {
        if (err instanceof AppError && (err.statusCode === 403 || err.statusCode === 404)) {
            return refuseWs(PRESENCE_PROTOCOL, WS_CLOSE.forbidden, "not a member");
        }
        return refuseWs(PRESENCE_PROTOCOL, WS_CLOSE.error, "unavailable");
    }

    const headers = new Headers(request.headers);
    headers.set(USER_HEADER, auth.userId);
    return env.LIST_PRESENCE.get(env.LIST_PRESENCE.idFromName(listId)).fetch(new Request(request, { headers }));
}

export async function evictFromPresence(env: Env, listId: string, userId?: string): Promise<void> {
    if (!env.LIST_PRESENCE) return;
    try {
        const stub = env.LIST_PRESENCE.get(env.LIST_PRESENCE.idFromName(listId));
        if (userId) await stub.evict(userId);
        else await stub.closeAll();
    } catch (err) {
        logger.warn("http", "presence_evict_failed", { issues: issuesFromError(err) });
    }
}
