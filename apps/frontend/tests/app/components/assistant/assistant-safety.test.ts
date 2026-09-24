import { describe, expect, it } from "vitest";
import { isInAppPath } from "../../../../app/components/assistant/Markdown";
import { outcomeOf, removedReason } from "../../../../app/components/assistant/widgets/ApprovalCard";
import { approvalAnswers } from "../../../../app/lib/ai/chat-transport";

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

describe("approval cards", () => {
    it("settle from the part: done, failed, declined, or never answered on an older reply", () => {
        expect(outcomeOf({ state: "output-available", output: {} })).toBe("done");
        expect(outcomeOf({ state: "output-available", output: { ok: false } })).toBe("failed");
        expect(outcomeOf({ state: "output-error" })).toBe("failed");
        expect(outcomeOf({ state: "output-denied", approval: { reason: "user removed it" } })).toBe("declined");
        expect(outcomeOf({ state: "approval-requested" })).toBeNull();
        expect(outcomeOf({ state: "approval-requested" }, true)).toBe("unanswered");
    });

    it("send only the answers, never the reply itself", () => {
        const reply = {
            id: "a1",
            role: "assistant" as const,
            parts: [
                { type: "text", text: "Here you go" },
                { type: "tool-create_tag", toolCallId: "c1", state: "approval-responded", input: {}, approval: { id: "ap1", approved: true } },
                { type: "tool-delete_tasks", toolCallId: "c2", state: "approval-responded", input: {}, approval: { id: "ap2", approved: false, reason: "no" } },
            ],
        };
        expect(approvalAnswers(reply as never)).toEqual([
            { id: "ap1", approved: true },
            { id: "ap2", approved: false, reason: "no" },
        ]);
    });

    it("name unticked rows in the decline, and approve when none are", () => {
        expect(removedReason([])).toBeUndefined();
        expect(removedReason(["Buy milk", "Call Sam"])).toContain("Buy milk; Call Sam");
    });
});
