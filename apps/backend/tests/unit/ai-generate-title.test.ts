import { describe, expect, it } from "vitest";
import { generateConversationTitle } from "../../src/domains/ai/title/generate-title";
import type { Env } from "../../src/types/env";

/** Minimal Env stub — only the fields generate-title reads. */
function env(overrides: Partial<Env> = {}): Env {
    return overrides as Env;
}

describe("generateConversationTitle (fallback path — no LLM call)", () => {
    it("falls back to a derived title when no OpenRouter key is configured", async () => {
        const { title } = await generateConversationTitle(env(), "remind me to call the IRS about taxes");
        expect(title).toBe("Remind me to call the IRS…");
    });

    it("returns the placeholder for empty input without a key", async () => {
        const { title } = await generateConversationTitle(env(), "   ");
        expect(title).toBe("New conversation");
    });

    it("titles an image-only first turn without calling the model", async () => {
        const { title } = await generateConversationTitle(env({ OPENROUTER_API_KEY: "key" }), "", true);
        expect(title).toBe("Photo");
    });
});
