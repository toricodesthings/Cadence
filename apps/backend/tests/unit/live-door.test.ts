import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../src/platform/errors";
import type { Env } from "../../src/types/env";

const verify = vi.hoisted(() => vi.fn());
vi.mock("../../src/platform/auth", () => ({ verifyAppToken: verify }));
import { connectLive } from "../../src/domains/push/reminder-clock";

const closed: number[] = [];
beforeEach(() => {
    closed.length = 0;
    vi.stubGlobal(
        "WebSocketPair",
        class {
            0 = {};
            1 = { accept() {}, close: (code: number) => closed.push(code) };
        },
    );
    vi.stubGlobal(
        "Response",
        class {
            constructor(
                public body: unknown,
                public init: unknown,
            ) {}
        },
    );
});

const knock = (env: object) =>
    connectLive(
        new Request("https://x/api/v1/live", {
            headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "cadence.live, a.jwt" },
        }),
        env as Env,
    );

describe("the live socket's door: who is told what", () => {
    it("a rejected token is told to sign in again (4401)", async () => {
        verify.mockRejectedValue(new AppError(401, "TOKEN_EXPIRED", "expired"));
        await knock({});
        expect(closed).toEqual([4401]);
    });

    it("a Neon Auth outage is 1011 (retry), never a sign-out", async () => {
        verify.mockRejectedValue(new AppError(503, "STORAGE_UNAVAILABLE", "down"));
        await knock({});
        expect(closed).toEqual([1011]);
        verify.mockRejectedValue(new Error("network"));
        await knock({});
        expect(closed).toEqual([1011, 1011]);
    });

    it("a good token with no clock bound is 1011, and with a clock is handed to that person's clock", async () => {
        verify.mockResolvedValue({ userId: "u1" });
        await knock({});
        expect(closed).toEqual([1011]);

        const fetch = vi.fn(async () => ({ status: 101 }));
        const names: string[] = [];
        await knock({ REMINDER_CLOCK: { idFromName: (n: string) => (names.push(n), n), get: () => ({ fetch }) } });
        expect(names).toEqual(["u1"]);
        const forwarded = (fetch.mock.calls[0] as unknown as [Request])[0];
        expect(forwarded.headers.get("X-Live-User")).toBe("u1");
        expect(forwarded.headers.get("X-Live-Auth")).toBe("jwt");
    });
});
