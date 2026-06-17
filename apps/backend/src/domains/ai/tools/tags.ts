import { tool } from "ai";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute } from "./index";
import { toMinimalTag } from "./projections";

export const tagTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_tags: tool({
        description:
            "READ-ONLY. List the user's tags/labels (id, name, color) for labeling context. " +
            "Hard-capped server-side.",
        inputSchema: z.object({}),
        execute: async () =>
            safeExecute("get_tags", userId, async () => {
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select({ id: tags.id, name: tags.name, color: tags.color })
                        .from(tags)
                        .where(eq(tags.userId, userId))
                        .orderBy(desc(tags.createdAt))
                        .limit(50),
                );
                return { tags: rows.map(toMinimalTag) };
            }),
    }),

    // ── P (proposal — NO DB WRITE) ──────────────────────────────────────────
    propose_create_tag: tool({
        description:
            "PROPOSAL ONLY — does NOT create anything. Validates a drafted tag/label when " +
            "organizing and returns it for confirmation; the tag is created later via REST after " +
            "explicit approval.",
        inputSchema: z.object({
            name: z.string().min(1).max(100).describe("Tag name."),
            color: z.string().max(40).optional().describe("Color token, e.g. 'default'."),
        }),
    }),
});
