import { afterEach, describe, expect, it, vi } from "vitest";
import { decide, decideChoice } from "../../src/domains/decisions/decision";

const env = { OPENROUTER_API_KEY: "k", AI_DECISION_MODEL: "vendor/model-1" } as never;
afterEach(() => vi.unstubAllGlobals());

function answers(body: unknown) {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
}

describe("decide", () => {
    it("asks every question in one call, each with its own kind", async () => {
        const spy = answers({ answers: {
            pick: { choice: "o1", probabilities: { o1: 0.95 } },
            effort: { type: "score", score: 2, probabilities: { "0": 0, "1": 0.02, "2": 0.98 } },
        } });
        const out = await decide(env, {
            kinds: { pick: "placement", effort: "effort" },
            state: { x: 1 },
            questions: {
                pick: { type: "choice", instructions: "i", candidates: [{ id: "a", label: "A" }] },
                effort: { type: "score", instructions: "i", levels: ["Low", "Medium", "High"] },
            },
        });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(out.pick).toMatchObject({ id: "a", outcome: "chose" });
        expect(out.effort).toMatchObject({ id: "2", outcome: "chose" });
        const sent = JSON.parse((spy.mock.calls[0] as unknown as [string, { body: string }])[1].body);
        expect(sent.questions.effort).toEqual({ type: "score", instructions: "i", criteria: ["Low", "Medium", "High"] });
    });

    it("holds a score below the threshold and never throws", async () => {
        answers({ answers: { effort: { probabilities: { "0": 0.5, "1": 0.3, "2": 0.2 } } } });
        const q = { effort: { type: "score" as const, instructions: "i", levels: ["Low", "Medium", "High"] } };
        expect((await decide(env, { kinds: { effort: "effort" }, state: "s", questions: q })).effort).toMatchObject({ id: null, outcome: "below_threshold" });
        vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("down"); }));
        expect((await decide(env, { kinds: { effort: "effort" }, state: "s", questions: q })).effort?.outcome).toBe("error");
    });

    it("decideChoice stays a one-question wrapper", async () => {
        answers({ answers: { pick: { choice: "o1", probabilities: { o1: 0.95 } } } });
        expect(await decideChoice(env, { kind: "search", state: "x", instructions: "i", candidates: [{ id: "a", label: "A" }] })).toMatchObject({ id: "a" });
    });
});
