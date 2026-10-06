import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { usage } from "../helpers/ai";
import type { Env } from "../../src/types/env";

const provider = vi.hoisted(() => ({ model: undefined as unknown }));
vi.mock("@openrouter/ai-sdk-provider", () => ({ createOpenRouter: () => () => provider.model }));

import { generateConversationTitle } from "../../src/domains/ai/title/generate-title";

const KEYED = { OPENROUTER_API_KEY: "key" } as Env;

/** A title model that answers `text`, or throws when given an Error. */
function titleModel(text: string | Error) {
    const model = new MockLanguageModelV4({
        doGenerate: async () => {
            if (text instanceof Error) throw text;
            return {
                content: [{ type: "text", text }],
                finishReason: { unified: "stop", raw: "stop" },
                usage,
                warnings: [],
                providerMetadata: { openrouter: { usage: { cost: 0.0001 } } },
            };
        },
    });
    provider.model = model;
    return model;
}

beforeEach(() => void (provider.model = undefined));

describe("generateConversationTitle", () => {
    it("asks the model with a capped prompt and a tiny output, and cleans up its answer", async () => {
        const model = titleModel('"Garden party plans."');

        const { title, spend } = await generateConversationTitle(KEYED, `plan the garden party ${"x".repeat(1000)}`);

        expect(title).toBe("Garden party plans");
        expect(spend).toMatchObject({ costUsd: 0.0001, inputTokens: 1, outputTokens: 1 });
        const [call] = model.doGenerateCalls;
        expect(call.maxOutputTokens).toBe(16);
        expect(JSON.stringify(call.prompt).length).toBeLessThan(2_000);
    });

    it.each([
        ["the model fails", new Error("503 upstream")],
        ["the model answers nothing usable", '""'],
    ])("falls back to a title from the user's text when %s", async (_label, answer) => {
        titleModel(answer);
        const { title } = await generateConversationTitle(KEYED, "remind me to call the IRS about taxes");
        expect(title).toBe("Remind me to call the IRS…");
    });

    it("never calls a model without a key, for empty text, or for an image-only turn", async () => {
        const model = titleModel("unused");

        expect((await generateConversationTitle({} as Env, "remind me to call the IRS about taxes")).title).toBe("Remind me to call the IRS…");
        expect((await generateConversationTitle(KEYED, "   ")).title).toBe("New conversation");
        expect((await generateConversationTitle(KEYED, "", true)).title).toBe("Photo");
        expect(model.doGenerateCalls).toHaveLength(0);
    });
});
