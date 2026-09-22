import { z } from "zod";
import { aiPromptBlockKindEnum } from "../../db/schema";

// Wire-crossing AI shapes (UIMessage, chat request, conversation/message
// schemas, widget part payloads) live in @cadence/contracts/ai.
export * from "@cadence/contracts/ai";

// ── Admin: prompt-block editing (doc 04 §5 option 2) — server-only ──
// Used only by the admin/debug-gated PATCH path. Any write bumps ai_prompt_revision
// in the same transaction (cache-bust). Not part of the public API surface.

export const promptBlockUpsertSchema = z.object({
    kind: z.enum(aiPromptBlockKindEnum.enumValues),
    layer: z.enum(["base", "auxiliary"]),
    locale: z.string().min(2).max(10).default("en"),
    orderIndex: z.number().int().min(0),
    template: z.string().min(1).max(20_000),
    isActive: z.boolean().optional(),
    notes: z.string().max(500).optional(),
});

// ── Admin: conversation auto-title prompt editing (ai_title_prompts) ──
// One active row per locale; the title-prompt loader picks it up within its TTL.
export const titlePromptUpsertSchema = z.object({
    locale: z.string().min(2).max(10).default("en"),
    template: z.string().min(1).max(20_000),
    isActive: z.boolean().optional(),
    notes: z.string().max(500).optional(),
});
