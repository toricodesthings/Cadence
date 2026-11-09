import { describe, expect, it } from "vitest";
import { DEFAULT_DEFINITION } from "@cadence/nlp/focus-views";
import { definitionFromParams, definitionToParams } from "@cadence/nlp/focus-views/url";

describe("focus view URL codec", () => {
    it("leaves defaults out, so the plain view has no params", () => {
        expect(definitionToParams(DEFAULT_DEFINITION)).toEqual({});
        expect(definitionFromParams(new URLSearchParams("sort=priority"))).toBeNull();
    });

    it("round-trips a custom view", () => {
        const d = { ...DEFAULT_DEFINITION, states: ["WAITING", "ACTIVE"], tagIds: ["a", "b"], dueWindow: "this_week" as const, priorityMin: 2, effortMax: 1, durationMaxMinutes: 15, waitingOnly: true, missingStructureOnly: true };
        const params = definitionToParams(d);
        expect(params).toMatchObject({ state: "waiting,active", tags: "a,b", due: "this_week", pmin: "2", emax: "1", dmax: "15", waiting: "1", bare: "1" });
        expect(definitionFromParams(new URLSearchParams(params))).toEqual(d);
    });

    it("skips bad values quietly", () => {
        const d = definitionFromParams(new URLSearchParams("state=nope&due=someday&pmin=9&emax=x&bare=1"));
        expect(d).toEqual({ ...DEFAULT_DEFINITION, missingStructureOnly: true });
    });
});
