import { describe, expect, it } from "vitest";
import { generateConversationTitle, getTitleModelId } from "../../src/domains/ai/title/generate-title";
import type { Env } from "../../src/types/env";

/** Minimal Env stub — only the fields generate-title reads. */
function env(overrides: Partial<Env> = {}): Env {
    return overrides as Env;
}

describe("generateConversationTitle (fallback path — no LLM call)", () => {
    it("falls back to a derived title when no OpenRouter key is configured", async () => {
        const title = await generateConversationTitle(env(), "remind me to call the IRS about taxes");
        expect(title).toBe("Remind me to call the IRS…");
    });

    it("returns the placeholder for empty input without a key", async () => {
        const title = await generateConversationTitle(env(), "   ");
        expect(title).toBe("New conversation");
    });
});

describe("getTitleModelId", () => {
    it("defaults to a small, cheap model", () => {
        expect(getTitleModelId(env())).toBe("google/gemma-3-27b-it");
    });

    it("honors the AI_TITLE_MODEL override", () => {
        expect(getTitleModelId(env({ AI_TITLE_MODEL: "openai/gpt-4o-mini" }))).toBe("openai/gpt-4o-mini");
    });
});
