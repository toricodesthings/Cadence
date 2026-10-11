// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

type Client = { focus: () => Promise<void>; postMessage: (m: unknown) => void; visibilityState?: string };

/** idb-keyval's store as sw.js opens it: one object store, requests that complete with their transaction. */
function fakeIndexedDb(saved: Map<string, unknown>) {
    return {
        open: () => {
            const open: any = {};
            setTimeout(() => {
                open.result = {
                    transaction: () => {
                        const tx: any = {};
                        const finish = (request: any) => { setTimeout(() => tx.oncomplete?.()); return request; };
                        tx.objectStore = () => ({
                            get: (key: string) => finish({ result: saved.get(key) }),
                            put: (value: unknown, key: string) => finish({ result: saved.set(key, value) && key }),
                        });
                        return tx;
                    },
                };
                open.onsuccess();
            });
            return open;
        },
    };
}

function worker(clients: Client[] = [], badging = false) {
    const handlers: Record<string, (event: any) => void> = {};
    const shown: Array<{ title: string; options: any }> = [];
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const saved = new Map<string, unknown>();
    const setAppBadge = vi.fn().mockResolvedValue(undefined);
    const self = {
        location: { origin: "https://cadence.test" },
        addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
        registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }); } },
        clients: { matchAll: async () => clients, openWindow },
        navigator: badging ? { setAppBadge } : {},
    };
    runInNewContext(source.replace("/*__PRECACHE__*/[]", "[]"), { self, caches: {}, fetch: vi.fn(), URL, Response, AbortSignal, setTimeout, clearTimeout, indexedDB: fakeIndexedDb(saved) });
    const run = async (name: string, event: object) => {
        const pending: Promise<unknown>[] = [];
        handlers[name]({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
        await Promise.all(pending);
    };
    return { run, shown, openWindow, saved, setAppBadge };
}

describe("push", () => {
    it("always shows what the server sent, with its tap target", async () => {
        const { run, shown } = worker();
        await run("push", { data: { json: () => ({ title: "Pay rent", body: "Due today", route: "/project/1?focusId=x", tag: "k" }) } });
        expect(shown).toEqual([{ title: "Pay rent", options: expect.objectContaining({ body: "Due today", tag: "k", data: { route: "/project/1?focusId=x" } }) }]);
    });

    it("reads a Declarative Web Push message, routing only to this app", async () => {
        const { run, shown } = worker();
        const push = (navigate: string) => run("push", { data: { json: () => ({ web_push: 8030, notification: { title: "Gym", body: "6 PM", navigate, tag: "g" }, route: "/flat" }) } });
        await push("https://cadence.test/routines?focusId=r");
        await push("https://evil.example/routines");
        expect(shown[0]).toEqual({ title: "Gym", options: expect.objectContaining({ body: "6 PM", tag: "g", data: { route: "/routines?focusId=r" } }) });
        expect(shown[1].options.data).toEqual({ route: "/flat" });
    });

    it("adds one to the saved icon badge per reminder while no window is on screen", async () => {
        const closed = worker([], true);
        closed.saved.set("cadence-app-badge", 2);
        const reminder = { data: { json: () => ({ web_push: 8030, notification: { title: "Pay rent", navigate: "/", tag: "k" } }) } };
        await closed.run("push", reminder);
        await closed.run("push", reminder);
        expect(closed.setAppBadge.mock.calls).toEqual([[3], [4]]);
        expect(closed.saved.get("cadence-app-badge")).toBe(4);

        await closed.run("push", { data: { json: () => ({ title: "Cadence test notification", tag: "cadence-test" }) } });
        const open = worker([{ focus: vi.fn(), postMessage: vi.fn(), visibilityState: "visible" }], true);
        await open.run("push", reminder);
        expect(closed.setAppBadge).toHaveBeenCalledTimes(2);
        expect(open.setAppBadge).not.toHaveBeenCalled();
    });

    it("still shows something when the payload is empty or unreadable", async () => {
        const { run, shown } = worker();
        await run("push", { data: { json: () => { throw new Error("bad"); } } });
        await run("push", {});
        expect(shown.map((n) => n.title)).toEqual(["Cadence", "Cadence"]);
    });

    it("tells an open app where to go, or opens the target when none is open", async () => {
        const client = { focus: vi.fn().mockResolvedValue(undefined), postMessage: vi.fn() };
        const open = worker([client]);
        const close = vi.fn();
        await open.run("notificationclick", { notification: { close, data: { route: "/routines" } } });
        expect(close).toHaveBeenCalled();
        expect(client.focus).toHaveBeenCalled();
        expect(client.postMessage).toHaveBeenCalledWith({ type: "cadence:open", route: "/routines" });

        const cold = worker();
        await cold.run("notificationclick", { notification: { close, data: { route: "/routines" } } });
        expect(cold.openWindow).toHaveBeenCalledWith("/routines");
    });

    it("never follows an off-origin target", async () => {
        const cold = worker();
        for (const route of ["//evil.example", "https://evil.example", undefined]) {
            await cold.run("notificationclick", { notification: { close: vi.fn(), data: { route } } });
        }
        expect(cold.openWindow.mock.calls).toEqual([["/"], ["/"], ["/"]]);
    });
});
