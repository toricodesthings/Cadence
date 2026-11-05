import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const wal: { status: string }[] = [];
const walListeners = new Set<() => void>();
let signedIn = true;
let jwt = "jwt-1";
const dropAuthJwt = vi.fn((token: string) => { if (jwt === token) jwt = "jwt-2"; });
vi.mock("../../../app/lib/api/offline-wal", () => ({ getWalSnapshot: () => wal, subscribeWal: (cb: () => void) => { walListeners.add(cb); return () => walListeners.delete(cb); } }));
vi.mock("../../../app/lib/api/client", () => ({ getAuthJwt: async () => jwt, dropAuthJwt: (t: string) => dropAuthJwt(t), isSessionHeld: () => false }));
vi.mock("../../../app/lib/env", () => ({ API_BASE_URL: "https://app.test" }));
vi.mock("../../../app/hooks/auth/use-auth-state", () => ({
    useAuthState: () => ({ authReady: true, isAuthenticated: signedIn, session: signedIn ? { user: { id: "u1" } } : null }),
}));

import { useLiveSync } from "../../../app/hooks/core/use-live-sync";
import { WAKE_EVENT } from "../../../app/hooks/core/use-wake-refresh";

class FakeSocket {
    static all: FakeSocket[] = [];
    static OPEN = 1;
    readyState = 1;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((e: { data: string }) => void) | null = null;
    onclose: ((e: { code: number }) => void) | null = null;
    close = vi.fn((code = 1000) => { this.readyState = 3; this.onclose?.({ code }); });
    constructor(public url: string, public protocols: string[]) { FakeSocket.all.push(this); }
    send(data: string) { this.sent.push(data); }
    open() { this.onopen?.(); }
    message(data: unknown) { this.onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) }); }
    drop(code = 1006) { this.readyState = 3; this.onclose?.({ code }); }
}

let client: QueryClient;
let invalidate: ReturnType<typeof vi.spyOn>;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const last = () => FakeSocket.all[FakeSocket.all.length - 1];
const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

async function mount() {
    const view = renderHook(() => useLiveSync(), { wrapper });
    await settle();
    last()?.open();
    return view;
}

beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    wal.length = 0;
    signedIn = true;
    jwt = "jwt-1";
    dropAuthJwt.mockClear();
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.spyOn(Math, "random").mockReturnValue(0.5); // jitter factor 1
    client = new QueryClient();
    invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("useLiveSync", () => {
    it("connects with the subprotocol and jwt, and the first version only records", async () => {
        await mount();
        expect(last().url).toBe("wss://app.test/api/v1/live");
        expect(last().protocols).toEqual(["cadence.live", "jwt-1"]);
        last().message({ v: 4 });
        await advance(10_000);
        expect(invalidate).not.toHaveBeenCalled();
    });

    it("does not connect when signed out", async () => {
        signedIn = false;
        await mount();
        expect(FakeSocket.all).toHaveLength(0);
    });

    it("a new version refreshes only active live-root queries, once for a burst", async () => {
        await mount();
        last().message({ v: 1 });
        for (let v = 2; v <= 11; v++) last().message({ v });
        await advance(1_000);
        expect(invalidate).toHaveBeenCalledOnce();
        const filters = invalidate.mock.calls[0][0] as { type: string; predicate: (q: { queryKey: unknown[] }) => boolean };
        expect(filters.type).toBe("active");
        expect(filters.predicate({ queryKey: ["tasks", {}] })).toBe(true);
        expect(filters.predicate({ queryKey: ["weather"] })).toBe(false);
        expect(filters.predicate({ queryKey: ["ai", "chat"] })).toBe(false);
    });

    it("waits while writes are queued or in flight, then refreshes once they settle", async () => {
        await mount();
        last().message({ v: 1 });
        wal.push({ status: "pending" });
        last().message({ v: 2 });
        await advance(10_000);
        expect(invalidate).not.toHaveBeenCalled();
        wal.length = 0;
        act(() => walListeners.forEach((cb) => cb()));
        expect(invalidate).toHaveBeenCalledOnce();
    });

    it("an unchanged version after a reconnect costs no refetch; a changed one does", async () => {
        await mount();
        last().message({ v: 5 });
        last().drop(1006);
        await advance(1_000);
        expect(FakeSocket.all).toHaveLength(2);
        last().open();
        last().message({ v: 5 });
        await advance(6_000);
        expect(invalidate).not.toHaveBeenCalled();
        last().drop(1006);
        await advance(2_000);
        last().open();
        last().message({ v: 9 });
        await advance(1_000);
        expect(invalidate).toHaveBeenCalledOnce();
    });

    it("backs off exponentially up to 30 minutes", async () => {
        await mount();
        const delays: number[] = [];
        for (let i = 0; i < 14; i++) {
            const before = FakeSocket.all.length;
            last().drop(1006);
            let waited = 0;
            while (FakeSocket.all.length === before) { await advance(1_000); waited += 1_000; }
            delays.push(waited);
        }
        expect(delays.slice(0, 4)).toEqual([1_000, 2_000, 4_000, 8_000]);
        expect(Math.max(...delays)).toBe(30 * 60_000);
    });

    it("pings every 45 s and reconnects when no pong comes within 10 s", async () => {
        await mount();
        await advance(45_000);
        expect(last().sent).toEqual(["ping"]);
        last().message("pong");
        await advance(10_000);
        expect(FakeSocket.all).toHaveLength(1);
        await advance(35_000);
        expect(last().sent).toEqual(["ping", "ping"]);
        await advance(10_000); // no pong
        await advance(1_000);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("4401 retries once with a new token, then stops until a wake signal", async () => {
        await mount();
        last().drop(4401);
        await settle();
        expect(dropAuthJwt).toHaveBeenCalledWith("jwt-1");
        expect(last().protocols[1]).toBe("jwt-2");
        last().open();
        last().drop(4401);
        await advance(60 * 60_000);
        expect(FakeSocket.all).toHaveLength(2);
        act(() => { window.dispatchEvent(new Event(WAKE_EVENT)); });
        await settle();
        expect(FakeSocket.all).toHaveLength(3);
    });

    it("4001 never retries; 4429 waits at least a minute", async () => {
        await mount();
        last().drop(4429);
        await advance(59_000);
        expect(FakeSocket.all).toHaveLength(1);
        await advance(1_000);
        expect(FakeSocket.all).toHaveLength(2);
        last().drop(4001);
        await advance(60 * 60_000);
        expect(FakeSocket.all).toHaveLength(2);
    });

    it("stays off while offline and connects when the connection returns", async () => {
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
        await mount();
        expect(FakeSocket.all).toHaveLength(0);
        vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
        act(() => { window.dispatchEvent(new Event("online")); });
        await settle();
        expect(FakeSocket.all).toHaveLength(1);
    });

    it("closes on unmount and ignores later events", async () => {
        const { unmount } = await mount();
        const socket = last();
        unmount();
        expect(socket.close).toHaveBeenCalledWith(1000);
        socket.message({ v: 1 });
        socket.message({ v: 2 });
        await advance(10_000);
        expect(invalidate).not.toHaveBeenCalled();
        expect(FakeSocket.all).toHaveLength(1);
    });
});
