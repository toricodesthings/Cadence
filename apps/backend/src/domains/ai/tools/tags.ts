import { tool } from "ai";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { tags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, MAX_LIST_LIMIT } from "./index";
import { toMinimalTag } from "./projections";

export const tagTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_tags: tool({
        description:
            "The user's tags. more:true when cut off.",
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
                        .limit(MAX_LIST_LIMIT + 1),
                );
                const more = rows.length > MAX_LIST_LIMIT;
                return { tags: rows.slice(0, MAX_LIST_LIMIT).map(toMinimalTag), ...(more && { more }) };
            }),
    }),

    // ── P (proposal — NO DB WRITE) ──────────────────────────────────────────
    propose_create_tag: tool({
        description:
            "Drafts a new tag.",
        inputSchema: z.object({
            name: z.string().min(1).max(100),
            color: z.string().max(40).optional().describe("Color token, e.g. 'default'."),
        }),
    }),
});
