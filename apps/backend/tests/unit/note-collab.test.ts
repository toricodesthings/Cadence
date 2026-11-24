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

vi.mock("y-partyserver", () => ({
    YServer: class {
        ctx: unknown;
        env: unknown;
        constructor(ctx: unknown, env: unknown) {
            this.ctx = ctx;
            this.env = env;
        }
    },
}));

import * as Y from "yjs";
import {
    NOTE_COLLAB_PATH_RE,
    NOTE_COLLAB_PROTOCOL,
    NoteCollab,
    connectNoteCollab,
} from "../../src/domains/notes/note-collab";

describe("NoteCollab routing and protocol", () => {
    it("matches /api/v1/notes/:uuid/collab paths", () => {
        const id = "019a2b3c-4d5e-7f80-9123-456789abcdef";
        expect(NOTE_COLLAB_PATH_RE.exec(`/api/v1/notes/${id}/collab`)?.[1]).toBe(id);
        expect(NOTE_COLLAB_PATH_RE.exec("/api/v1/notes/bad/collab")).toBeNull();
    });

    it("rejects non-websocket or wrong-protocol requests", async () => {
        const res1 = await connectNoteCollab(new Request("https://api.test/api/v1/notes/x/collab"), {} as never, "x");
        expect(res1.status).toBe(426);

        const res2 = await connectNoteCollab(
            new Request("https://api.test/api/v1/notes/x/collab", {
                headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "wrong, tok" },
            }),
            {} as never,
            "x",
        );
        expect(res2.status).toBe(400);
        expect(NOTE_COLLAB_PROTOCOL).toBe("cadence.collab");
    });

    it("clears warm Y.Doc and closes sockets on resetFromExternal, and evicts per-user or all", async () => {
        const closeA = vi.fn();
        const closeB = vi.fn();
        const wsA = { state: { userId: "u-a" }, close: closeA };
        const wsB = { state: { userId: "u-b" }, close: closeB };
        const ctx = {
            getWebSockets: () => [wsA, wsB],
            blockConcurrencyWhile: () => Promise.resolve(),
            storage: { sql: { exec: vi.fn() } },
        };
        const room = new NoteCollab(ctx as never, {} as never);
        (room as unknown as { getConnections: () => unknown[] }).getConnections = () => [wsA, wsB];
        const doc = new Y.Doc();
        doc.getXmlFragment("default").insert(0, [new Y.XmlText("hello")]);
        doc.getMap("meta").set("seeded", true);
        (room as unknown as { document: Y.Doc }).document = doc;

        await room.resetFromExternal();
        expect(doc.getXmlFragment("default").length).toBe(0);
        expect(doc.getMap("meta").get("seeded")).toBeUndefined();
        expect(closeA).toHaveBeenCalledWith(4000, "updated");
        expect(closeB).toHaveBeenCalledWith(4000, "updated");

        closeA.mockClear();
        closeB.mockClear();
        await room.evict("u-a");
        expect(closeA).toHaveBeenCalledWith(4403, "revoked");
        expect(closeB).not.toHaveBeenCalled();

        closeA.mockClear();
        await room.closeAll();
        expect(closeA).toHaveBeenCalledWith(4403, "unshared");
        expect(closeB).toHaveBeenCalledWith(4403, "unshared");
    });
});
