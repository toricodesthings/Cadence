import { describe, expect, it } from "vitest";
import { isInAppPath } from "../../../../app/components/assistant/Markdown";
import { shouldAutoApply } from "../../../../app/components/assistant/widgets/use-proposal-resolver";

describe("isInAppPath (assistant links)", () => {
    it("treats same-origin paths as in-app", () => {
        expect(isInAppPath("/today")).toBe(true);
        expect(isInAppPath("/schedule?view=week&date=2026-09-26")).toBe(true);
    });

    it("never treats protocol-relative or absolute URLs as in-app", () => {
        expect(isInAppPath("//evil.example")).toBe(false);
        expect(isInAppPath("/\\evil.example")).toBe(false);
        expect(isInAppPath("https://evil.example")).toBe(false);
        expect(isInAppPath("?settings=assistant")).toBe(false);
    });
});

describe("shouldAutoApply (approval modes)", () => {
    it("Ask first never applies on its own", () => {
        expect(shouldAutoApply("ask", false)).toBe(false);
        expect(shouldAutoApply(undefined, false)).toBe(false);
    });

    it("Auto applies everything except a permanent delete or a change to more than 5 tasks", () => {
        expect(shouldAutoApply("auto", false)).toBe(true);
        expect(shouldAutoApply("auto", true)).toBe(false);
        expect(shouldAutoApply("auto", false, 5)).toBe(true);
        expect(shouldAutoApply("auto", false, 6)).toBe(false);
    });

    it("Full applies permanent deletes and big batches too", () => {
        expect(shouldAutoApply("full", true)).toBe(true);
        expect(shouldAutoApply("full", false, 50)).toBe(true);
    });
});
