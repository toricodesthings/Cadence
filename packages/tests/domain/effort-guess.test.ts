import { describe, expect, it } from "vitest";
import type { EffortEvidence } from "@cadence/nlp/effort";
import { effortGuessOf } from "@cadence/domain/effort-guess";

const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;
const lab = (n: number, level: 1 | 2 | 3): EffortEvidence => ({ title: `Lab ${n} report`, projectId: null, level, origin: "manual", day: day(n) });
const evidence = [lab(1, 3), lab(2, 3), lab(3, 3)];
const task = { effort: null, title: "Lab 4 report", projectId: null };
const today = day(20);

describe("effortGuessOf", () => {
    it("guesses a single level from similar choices", () => {
        expect(effortGuessOf(task, evidence, today)).toMatchObject({ level: 3, source: "similar" });
    });
    it("a chosen Effort has no guess", () => {
        expect(effortGuessOf({ ...task, effort: 1 }, evidence, today)).toBeNull();
    });
    it("a stored model guess beats similar", () => {
        expect(effortGuessOf({ ...task, effortGuess: 1, effortGuessSource: "model" }, evidence, today)).toMatchObject({ level: 1, source: "model" });
    });
    it("dismissed returns null", () => {
        expect(effortGuessOf({ ...task, effortGuessSource: "dismissed" }, evidence, today)).toBeNull();
    });
    it("a range never acts", () => {
        const split = [lab(1, 2), lab(2, 3), lab(3, 2), lab(5, 3)];
        expect(effortGuessOf(task, split, today)).toBeNull();
    });
    it("no evidence, no guess", () => {
        expect(effortGuessOf(task, [], today)).toBeNull();
    });
});
