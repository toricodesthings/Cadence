import { describe, expect, it } from "vitest";
import { TAG_PALETTE, TASK_PRIORITY_LABELS } from "@cadence/contracts/constants";

describe("priority constants", () => {
    it("labels every priority level 0–4", () => {
        expect(Object.keys(TASK_PRIORITY_LABELS).map(Number)).toEqual([0, 1, 2, 3, 4]);
        expect(TASK_PRIORITY_LABELS[4]).toBe("Urgent");
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
