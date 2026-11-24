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

import { NOTE_COLLAB_PATH_RE, NOTE_COLLAB_PROTOCOL, connectNoteCollab } from "../../src/domains/notes/note-collab";

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
});
