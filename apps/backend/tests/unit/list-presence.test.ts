import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
    DurableObject: class {
        ctx: unknown;
        env: unknown;
        constructor(ctx: unknown, env: unknown) {
            this.ctx = ctx;
            this.env = env;
        }
    },
}));

(globalThis as Record<string, unknown>).WebSocketRequestResponsePair = class {
    constructor(
        public request: string,
        public response: string,
    ) {}
};

import {
    ListPresence,
    PRESENCE_PATH_RE,
    PRESENCE_PROTOCOL,
    connectPresence,
} from "../../src/domains/sharing/list-presence";

function fakeState() {
    const sockets = new Map<WebSocket, string[]>();
    let autoPair: unknown = null;
    const ctx = {
        setWebSocketAutoResponse: (pair: unknown) => {
            autoPair = pair;
        },
        acceptWebSocket: (ws: WebSocket, tags: string[] = []) => {
            sockets.set(ws, tags);
        },
        getWebSockets: (tag?: string) => {
            const all = [...sockets.keys()];
            return tag ? all.filter((ws) => (sockets.get(ws) ?? []).includes(tag)) : all;
        },
        getTags: (ws: WebSocket) => sockets.get(ws) ?? [],
    };
    const makeSocket = () => {
        const sent: string[] = [];
        const closed: Array<{ code: number; reason: string }> = [];
        const ws = {
            send: (msg: string) => sent.push(msg),
            close: (code = 1000, reason = "") => {
                closed.push({ code, reason });
                sockets.delete(ws as unknown as WebSocket);
            },
        } as unknown as WebSocket;
        return { ws, sent, closed };
    };
    return { ctx, sockets, makeSocket, getAutoPair: () => autoPair };
}

describe("ListPresence", () => {
    it("matches /api/v1/lists/:uuid/presence paths", () => {
        const id = "019a2b3c-4d5e-7f80-9123-456789abcdef";
        expect(PRESENCE_PATH_RE.exec(`/api/v1/lists/${id}/presence`)?.[1]).toBe(id);
        expect(PRESENCE_PATH_RE.exec("/api/v1/lists/not-a-uuid/presence")).toBeNull();
    });

    it("rejects non-websocket or wrong-protocol requests", async () => {
        const res1 = await connectPresence(new Request("https://api.test/api/v1/lists/x/presence"), {} as never, "x");
        expect(res1.status).toBe(426);

        const res2 = await connectPresence(
            new Request("https://api.test/api/v1/lists/x/presence", {
                headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "wrong, tok" },
            }),
            {} as never,
            "x",
        );
        expect(res2.status).toBe(400);
        expect(PRESENCE_PROTOCOL).toBe("cadence.presence");
    });

    it("deduplicates online users across multiple tabs and broadcasts on close/evict", async () => {
        const { ctx, makeSocket, getAutoPair } = fakeState();
        const presence = new ListPresence(ctx as unknown as DurableObjectState, {} as never);
        expect(getAutoPair()).toBeTruthy();

        const alice1 = makeSocket();
        const alice2 = makeSocket();
        const bob = makeSocket();
        ctx.acceptWebSocket(alice1.ws, ["alice"]);
        ctx.acceptWebSocket(alice2.ws, ["alice"]);
        ctx.acceptWebSocket(bob.ws, ["bob"]);

        expect(presence.onlineUserIds()).toEqual(["alice", "bob"]);

        presence.webSocketClose(alice1.ws, 1000);
        expect(presence.onlineUserIds()).toEqual(["alice", "bob"]);
        expect(JSON.parse(bob.sent.at(-1)!)).toEqual({ type: "presence", userIds: ["alice", "bob"] });

        await presence.evict("alice");
        expect(alice2.closed[0]?.code).toBe(4403);
        expect(presence.onlineUserIds()).toEqual(["bob"]);
        expect(JSON.parse(bob.sent.at(-1)!)).toEqual({ type: "presence", userIds: ["bob"] });
    });
});
