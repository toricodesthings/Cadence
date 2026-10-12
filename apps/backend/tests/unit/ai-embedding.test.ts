import { describe, expect, it, vi } from "vitest";
import { MockEmbeddingModelV4 } from "ai/test";
import type { Env } from "../../src/types/env";

const provider = vi.hoisted(() => ({ model: undefined as unknown, settings: undefined as unknown }));
vi.mock("@openrouter/ai-sdk-provider", () => ({
    createOpenRouter: () => ({
        textEmbeddingModel: (_id: string, settings: unknown) => {
            provider.settings = settings;
            return provider.model;
        },
    }),
}));

import { embedText, embedTexts } from "../../src/domains/ai/memory/embedding";

const env = {} as Env;

/** An embedding model that returns one `dims`-long vector per value. */
function embeddingModel(dims: number) {
    const model = new MockEmbeddingModelV4({
        doEmbed: async ({ values }) => ({
            embeddings: values.map(() => Array(dims).fill(0.1)),
            usage: { tokens: 7 },
            providerMetadata: { openrouter: { usage: { cost: 0.00002 } } },
            warnings: [],
        }),
    });
    provider.model = model;
    return model;
}

describe("embedding", () => {
    it("embeds one text into the column's 512 dims, with what it cost", async () => {
        embeddingModel(512);

        const { embedding, spend } = await embedText(env, "likes mornings");

        expect(embedding).toHaveLength(512);
        expect(spend).toMatchObject({ inputTokens: 7, costUsd: 0.00002 });
        // extraBody lands in the /embeddings body; require_parameters keeps OpenRouter off upstreams that ignore it.
        expect(provider.settings).toMatchObject({ extraBody: { dimensions: 512 }, provider: { require_parameters: true } });
    });

    it("embeds a batch, and skips the call for an empty one", async () => {
        const model = embeddingModel(512);

        expect(await embedTexts(env, [])).toEqual([]);
        expect(model.doEmbedCalls).toHaveLength(0);
        expect(await embedTexts(env, ["a", "b"])).toHaveLength(2);
    });

    it("refuses a vector that would not fit the column", async () => {
        embeddingModel(4096);

        await expect(embedText(env, "x")).rejects.toThrow(/dimension mismatch/);
        await expect(embedTexts(env, ["x"])).rejects.toThrow(/dimension mismatch/);
    });
});
