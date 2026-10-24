import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createUser, getTestDb, startTestDb } from "../helpers/db";
vi.mock("../../src/platform/db", async () => ({ getDbClient: (await import("../helpers/db")).getTestDb }));
import { suggestEffortGuess } from "../../src/domains/decisions/effort-guess";
import { createTask, updateTask } from "../../src/domains/tasks/tasks.service";
import { withRls } from "../../src/platform/rls";
import { tasks } from "../../src/db/schema";

const env = { OPENROUTER_API_KEY: "k", AI_DECISION_MODEL: "vendor/model-1" } as never;
let userId: string;
const row = (id: string) => withRls(getTestDb(), userId, async (tx) => (await tx.select().from(tasks).where(eq(tasks.id, id)))[0]);
const make = (title: string, extra: object = {}) =>
    withRls(getTestDb(), userId, async (tx) => (await createTask(tx, userId, { title, orderIndex: 0, ...extra } as never, [])).id);
const modelSays = (level: number, p = 0.98) =>
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        answers: { effort: { probabilities: { [String(level)]: p } } },
    }), { status: 200 })));

/** Eight own choices over two levels, none similar to "Write up the lab". */
async function history() {
    for (let i = 0; i < 8; i++) await make(`Unrelated chore ${"abcdefgh"[i]}${i}`, { effort: i % 2 ? 3 : 1, effortOrigin: "manual" });
}

beforeAll(startTestDb);
beforeEach(async () => { userId = await createUser(); });
afterEach(() => vi.unstubAllGlobals());

describe("model effort guess", () => {
    it("stores a confident guess beside the task, never as its Effort", async () => {
        await history();
        modelSays(2);
        const id = await make("Write up the lab");
        await suggestEffortGuess(env, userId, id);
        expect(await row(id)).toMatchObject({ effort: null, effortGuess: 3, effortGuessSource: "model" });
    });

    it("asks nothing for a new account (too few own choices)", async () => {
        const spy = vi.fn();
        vi.stubGlobal("fetch", spy);
        const id = await make("Write up the lab");
        await suggestEffortGuess(env, userId, id);
        expect(spy).not.toHaveBeenCalled();
        expect((await row(id)).effortGuess).toBeNull();
    });

    it("stores nothing below the threshold", async () => {
        await history();
        modelSays(2, 0.5);
        const id = await make("Write up the lab");
        await suggestEffortGuess(env, userId, id);
        expect((await row(id)).effortGuess).toBeNull();
    });

    it("a new title or a chosen Effort clears it; a dismissal sticks until the title changes", async () => {
        await history();
        modelSays(0);
        const id = await make("Write up the lab");
        await suggestEffortGuess(env, userId, id);
        const set = (patch: object) => withRls(getTestDb(), userId, (tx) => updateTask(tx, userId, id, patch as never));
        await set({ effortGuessSource: "dismissed" });
        expect(await row(id)).toMatchObject({ effortGuess: null, effortGuessSource: "dismissed" });
        await set({ title: "Write the lab" });
        expect((await row(id)).effortGuessSource).toBeNull();
        await suggestEffortGuess(env, userId, id);
        expect((await row(id)).effortGuess).toBe(1);
        await set({ effort: 2, effortOrigin: "manual" });
        expect(await row(id)).toMatchObject({ effortGuess: null, effortGuessSource: null });
    });

    it("never throws when the provider fails", async () => {
        await history();
        vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
        const id = await make("Write up the lab");
        await expect(suggestEffortGuess(env, userId, id)).resolves.toBeUndefined();
    });
});
