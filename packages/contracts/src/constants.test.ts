import { describe, expect, it } from "vitest";
import { TAG_PALETTE, TASK_PRIORITY_LABELS, TASK_PRIORITY_SORT_WEIGHT } from "./constants";

describe("priority constants", () => {
    it("labels every priority level 0–4", () => {
        expect(Object.keys(TASK_PRIORITY_LABELS).map(Number)).toEqual([0, 1, 2, 3, 4]);
        expect(TASK_PRIORITY_LABELS[4]).toBe("Urgent");
    });

    it("sorts higher priorities first", () => {
        const weights = [0, 1, 2, 3, 4].map((p) => TASK_PRIORITY_SORT_WEIGHT[p as 0 | 1 | 2 | 3 | 4]);
        expect(weights).toEqual([...weights].sort((a, b) => a - b));
        expect(new Set(weights).size).toBe(weights.length);
    });
});

describe("TAG_PALETTE", () => {
    it("starts with the themeable 'default' sentinel, then only unique 6-digit hex colours", () => {
        const [sentinel, ...colours] = TAG_PALETTE;

        expect(sentinel).toBe("default");
        for (const colour of colours) expect(colour).toMatch(/^#[0-9a-f]{6}$/);
        expect(new Set(TAG_PALETTE).size).toBe(TAG_PALETTE.length);
    });
});
