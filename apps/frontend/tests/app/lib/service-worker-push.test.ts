// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");

function worker(clients: Array<{ focus: () => Promise<void>; postMessage: (m: unknown) => void }> = []) {
    const handlers: Record<string, (event: any) => void> = {};
    const shown: Array<{ title: string; options: any }> = [];
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const self = {
        location: { origin: "https://cadence.test" },
        addEventListener: (name: string, handler: any) => { handlers[name] = handler; },
        registration: { showNotification: async (title: string, options: any) => { shown.push({ title, options }); } },
        clients: { matchAll: async () => clients, openWindow },
    };
    runInNewContext(source.replace("/*__PRECACHE__*/[]", "[]"), { self, caches: {}, fetch: vi.fn(), URL, Response, AbortSignal, setTimeout, clearTimeout });
    const run = async (name: string, event: object) => {
        const pending: Promise<unknown>[] = [];
        handlers[name]({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
        await Promise.all(pending);
    };
    return { run, shown, openWindow };
}

describe("push", () => {
    it("always shows what the server sent, with its tap target", async () => {
        const { run, shown } = worker();
        await run("push", { data: { json: () => ({ title: "Pay rent", body: "Due today", route: "/project/1?focusId=x", tag: "k" }) } });
        expect(shown).toEqual([{ title: "Pay rent", options: expect.objectContaining({ body: "Due today", tag: "k", data: { route: "/project/1?focusId=x" } }) }]);
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
