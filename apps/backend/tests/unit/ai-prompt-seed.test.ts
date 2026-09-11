import { describe, expect, it } from "vitest";
import {
    computeSeedPlan,
    DEFAULT_PROMPT_BLOCKS,
    type SeedRow,
} from "../../src/domains/ai/prompt/prompt-cache";

/**
 * Pure seed-plan logic (code-canonical prompt sync — prompt-cache header).
 * The plan decides which compiled-in defaults get written to ai_prompt_blocks:
 * missing rows and rows whose DB version is LOWER than the code default.
 */

const asRows = (blocks: typeof DEFAULT_PROMPT_BLOCKS): SeedRow[] =>
    blocks.map((b) => ({ kind: b.kind, locale: b.locale, version: b.version }));

describe("computeSeedPlan", () => {
    it("seeds everything into an empty database", () => {
        const plan = computeSeedPlan([], DEFAULT_PROMPT_BLOCKS);
        expect(plan).toHaveLength(DEFAULT_PROMPT_BLOCKS.length);
    });

    it("is a no-op when the DB already matches the code versions", () => {
        const plan = computeSeedPlan(asRows(DEFAULT_PROMPT_BLOCKS), DEFAULT_PROMPT_BLOCKS);
        expect(plan).toHaveLength(0);
    });

    it("re-seeds only the block whose code version is newer", () => {
        const rows = asRows(DEFAULT_PROMPT_BLOCKS).map((r) =>
            r.kind === "persona_customization" ? { ...r, version: r.version - 1 } : r,
        );
        const plan = computeSeedPlan(rows, DEFAULT_PROMPT_BLOCKS);
        expect(plan.map((b) => b.kind)).toEqual(["persona_customization"]);
    });

    it("never clobbers an admin hot-patch (DB version HIGHER than code)", () => {
        const rows = asRows(DEFAULT_PROMPT_BLOCKS).map((r) =>
            r.kind === "safety" ? { ...r, version: r.version + 5 } : r,
        );
        const plan = computeSeedPlan(rows, DEFAULT_PROMPT_BLOCKS);
        expect(plan.find((b) => b.kind === "safety")).toBeUndefined();
    });

    it("adds a missing block without touching the rest", () => {
        const rows = asRows(DEFAULT_PROMPT_BLOCKS).filter((r) => r.kind !== "tool_policy");
        const plan = computeSeedPlan(rows, DEFAULT_PROMPT_BLOCKS);
        expect(plan.map((b) => b.kind)).toEqual(["tool_policy"]);
    });

    it("treats a different locale row as a separate key (never cross-matches)", () => {
        const rows: SeedRow[] = [{ kind: "identity", locale: "fr", version: 99 }];
        const plan = computeSeedPlan(rows, DEFAULT_PROMPT_BLOCKS);
        // The 'en' identity default is still missing → still planned.
        expect(plan.some((b) => b.kind === "identity" && b.locale === "en")).toBe(true);
    });
});

describe("DEFAULT_PROMPT_BLOCKS versioning invariants", () => {
    it("persona_customization carries the customInstructions placeholder and a bumped version", () => {
        const block = DEFAULT_PROMPT_BLOCKS.find((b) => b.kind === "persona_customization")!;
        expect(block.template).toContain("{{customInstructions}}");
        expect(block.version).toBeGreaterThanOrEqual(2);
    });

    it("every (kind, locale) pair is unique — the seed upsert target", () => {
        const keys = DEFAULT_PROMPT_BLOCKS.map((b) => `${b.kind}|${b.locale}`);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
