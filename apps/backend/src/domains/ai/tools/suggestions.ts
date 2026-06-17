import { tool } from "ai";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { suggestions } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import { toMinimalSuggestion } from "./projections";

export const suggestionTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_suggestions: tool({
        description:
            "READ-ONLY. List the user's PENDING load-balancing suggestions (id, type, title, " +
            "relatedTaskIds). Free-text bodies are omitted. Hard-capped server-side.",
        inputSchema: z.object({
            limit: z.number().int().min(1).max(50).default(20).describe("Max rows (capped at 50)."),
        }),
        execute: async ({ limit }) =>
            safeExecute("get_suggestions", userId, async () => {
                const cap = clampLimit(limit);
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select({
                            id: suggestions.id,
                            type: suggestions.type,
                            title: suggestions.title,
                            status: suggestions.status,
                            relatedTaskIds: suggestions.relatedTaskIds,
                        })
                        .from(suggestions)
                        .where(
                            and(
                                eq(suggestions.userId, userId),
                                eq(suggestions.status, "PENDING"),
                            ),
                        )
                        .orderBy(desc(suggestions.createdAt))
                        .limit(cap),
                );
                return { suggestions: rows.map(toMinimalSuggestion) };
            }),
    }),

    // ── P (proposal — NO DB WRITE) ──────────────────────────────────────────
    propose_suggestion_action: tool({
        description:
            "PROPOSAL ONLY — does NOT change anything. Proposes accepting or dismissing a pending " +
            "suggestion; the status change is applied later via REST after confirmation.",
        inputSchema: z.object({
            suggestionId: z.string().uuid().describe("Suggestion to act on."),
            action: z.enum(["accept", "dismiss"]).describe("Accept or dismiss the suggestion."),
        }),
    }),
});
