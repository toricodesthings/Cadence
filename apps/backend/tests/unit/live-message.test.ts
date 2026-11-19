import { describe, expect, it, vi } from "vitest";
import { LIVE_MAX_BYTES, LIVE_MAX_CHANGES, type LiveChange } from "@cadence/contracts/live";
import { ReminderClock } from "../../src/domains/push/reminder-clock";

function clock() {
    vi.stubGlobal("WebSocketRequestResponsePair", class {});
    const data = new Map<string, unknown>();
    const socket = { send: vi.fn() };
    const state = {
        setWebSocketAutoResponse: () => {},
        getWebSockets: () => [socket],
        getTags: () => [],
        storage: {
            get: async (key: string) => data.get(key),
            put: async (key: string, value: unknown) => void data.set(key, value),
        },
    };
    return { clock: new ReminderClock(state as never, {} as never), socket, data };
}

const gone = (n: number): LiveChange[] =>
    Array.from({ length: n }, (_, i) => ({
        type: "task.gone",
        id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    }));

describe("a live message", () => {
    it("carries the rows with the version, and stores only the version", async () => {
        const { clock: c, socket, data } = clock();
        await c.ping(undefined, gone(2));
        expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({ v: 1, changes: gone(2) });
        expect([...data.keys()]).toEqual(["liveVersion"]);
    });

    it("is a bare version with no rows, or too many", async () => {
        const { clock: c, socket } = clock();
        await c.ping();
        await c.ping(undefined, []);
        await c.ping(undefined, gone(LIVE_MAX_CHANGES + 1));
        expect(socket.send.mock.calls.map(([m]) => m)).toEqual(['{"v":1}', '{"v":2}', '{"v":3}']);
    });

    it("is a bare version when the rows are too big", async () => {
        const { clock: c, socket } = clock();
        const big = { type: "task", task: { title: "x".repeat(LIVE_MAX_BYTES) } } as unknown as LiveChange;
        await c.ping(undefined, [big]);
        expect(socket.send.mock.calls[0][0]).toBe('{"v":1}');
    });
});
