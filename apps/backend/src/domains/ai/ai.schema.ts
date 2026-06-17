import { z } from "zod";

// Wire-crossing AI shapes (UIMessage, chat request, conversation/message
// schemas, widget part payloads) live in @cadence/contracts/ai.
export * from "@cadence/contracts/ai";

// ── Admin: prompt-block editing (doc 04 §5 option 2) — server-only ──
// Used only by the admin/debug-gated PATCH path. Any write bumps ai_prompt_revision
// in the same transaction (cache-bust). Not part of the public API surface.

export const promptBlockKindSchema = z.enum([
    "identity", "safety", "operating_principles", "output_contract", "tool_policy",
    "runtime_context", "human_metrics", "persona_customization",
    "retrieved_memory", "workspace_snapshot", "tone_neutral", "tone_protective",
]);

export const promptBlockUpsertSchema = z.object({
    kind: promptBlockKindSchema,
    layer: z.enum(["base", "auxiliary"]),
    locale: z.string().min(2).max(10).default("en"),
    orderIndex: z.number().int().min(0),
    template: z.string().min(1).max(20_000),
    isActive: z.boolean().optional(),
    notes: z.string().max(500).optional(),
});
export type PromptBlockUpsert = z.infer<typeof promptBlockUpsertSchema>;
