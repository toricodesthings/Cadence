import { describe, expect, it } from "vitest";
import { getAgentInstance } from "../../src/domains/ai/agent";
import type { Env } from "../../src/types/env";

describe("getAgentInstance", () => {
    it("refuses to build an agent in production without TOOL_APPROVAL_SECRET", async () => {
        const opts = { timezone: "UTC", currentDate: "2026-11-09T12:00:00.000Z", approvalMode: "ask", nonce: "n" } as const;
        await expect(getAgentInstance({} as Env, "11111111-1111-4111-8111-111111111111", opts)).rejects.toMatchObject({ code: "AUTH_MISCONFIGURED" });
    });
});
