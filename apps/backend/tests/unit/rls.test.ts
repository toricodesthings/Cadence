import { describe, expect, it, vi } from "vitest";
import { tracing } from "cloudflare:workers";
import { withRls } from "../../src/platform/rls";
import type { DbClient } from "../../src/platform/db";
import type { Tx } from "../../src/types/db";

// Match workerd: only a native Promise keeps an automatic span open.
function recordSpanEnds() {
    const ended: string[] = [];
    type Span = Parameters<Parameters<typeof tracing.enterSpan>[1]>[0];
    vi.spyOn(tracing, "enterSpan").mockImplementation((name, callback) => {
        const result = callback({ setAttribute: vi.fn() } as unknown as Span);
        if (result instanceof Promise) void result.then(() => ended.push(name), () => ended.push(name));
        else ended.push(name);
        return result;
    });
    return ended;
}
const thenable = <T>(promise: Promise<T>) => ({ then: promise.then.bind(promise) }) as Promise<T>;

function database(context: Promise<void>) {
    const tx = { execute: vi.fn(() => thenable(context)) } as unknown as Tx;
    return { transaction: async (callback: (value: Tx) => Promise<unknown>) => callback(tx) } as unknown as DbClient;
}

describe("RLS trace lifetimes", () => {
    it("includes delayed context and lazy query execution in their spans", async () => {
        const ended = recordSpanEnds();
        const context = Promise.withResolvers<void>();
        const query = Promise.withResolvers<string>();
        const work = vi.fn(() => thenable(query.promise));
        const result = withRls(database(context.promise), "account", work);
        expect(ended).not.toContain("db.rls.context");
        expect(work).not.toHaveBeenCalled();
        context.resolve();
        await vi.waitFor(() => expect(work).toHaveBeenCalledOnce());
        expect(ended).toContain("db.rls.context");
        expect(ended).not.toContain("db.rls.work");
        query.resolve("rows");
        await expect(result).resolves.toBe("rows");
        expect(ended).toEqual(["db.rls.context", "db.rls.work", "db.rls.transaction"]);
    });

    it("ends spans and propagates a lazy query rejection", async () => {
        const ended = recordSpanEnds();
        const error = new Error("query unavailable");
        await expect(withRls(database(Promise.resolve()), "account", () => thenable(Promise.reject(error)))).rejects.toBe(error);
        expect(ended).toEqual(["db.rls.context", "db.rls.work", "db.rls.transaction"]);
    });
});
