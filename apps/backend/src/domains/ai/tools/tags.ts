import { tool } from "ai";
import { z } from "zod";
import { and, asc, eq, ilike } from "drizzle-orm";
import { insertTagSchema } from "@cadence/contracts/tag";
import { getDbClient } from "../../../platform/db";
import { tags } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, once, MAX_LIST_LIMIT } from "./index";
import { toMinimalTag } from "./projections";
import { offsetSchema } from "./drafts";
import { TAG_COLOR_NAMES, TAG_PALETTE } from "@cadence/contracts/constants";
import { createTag, deleteTag, updateTag } from "../../tags/tags.service";

const color = z.enum(TAG_COLOR_NAMES);

const toHex = <T extends { color?: string }>(input: T): T =>
    input.color === undefined
        ? input
        : { ...input, color: TAG_PALETTE[TAG_COLOR_NAMES.indexOf(input.color as never)] ?? input.color };

export const tagTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    get_tags: tool({
        description: "The user's tags, by name. Search with query; more:true and nextOffset when there's more.",
        inputSchema: z.object({
            query: z.string().trim().min(1).max(100).optional().describe("Words in the tag name, case-insensitive."),
            offset: offsetSchema,
        }),
        execute: async ({ query, offset = 0 }) =>
            safeExecute("get_tags", userId, async () => {
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select({ id: tags.id, name: tags.name, color: tags.color })
                        .from(tags)
                        .where(
                            and(
                                eq(tags.userId, userId),
                                query
                                    ? ilike(tags.name, `%${query.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)
                                    : undefined,
                            ),
                        )
                        .orderBy(asc(tags.name), asc(tags.id))
                        .limit(MAX_LIST_LIMIT + 1)
                        .offset(offset),
                );
                const more = rows.length > MAX_LIST_LIMIT;
                return {
                    tags: rows.slice(0, MAX_LIST_LIMIT).map(toMinimalTag),
                    ...(more && { more, nextOffset: offset + MAX_LIST_LIMIT }),
                };
            }),
    }),

    create_tag: tool({
        description:
            "Creates a tag. Leave colour out unless they named one; Cadence picks one. Returns its tagId. (Task writes can also tag by name, making the tag on the way.)",
        inputSchema: z.object({
            name: insertTagSchema.shape.name,
            color: color.optional(),
        }),
        execute: async (input, { toolCallId }) =>
            safeExecute("create_tag", userId, async () => {
                const row = await withRls(getDbClient(env), userId, (tx) =>
                    createTag(tx, userId, toHex(input), toolCallId),
                );
                return { tagId: row.id, name: row.name };
            }),
    }),

    update_tag: tool({
        description: "Renames or recolours a tag; every task and routine keeps it. Send only what changes.",
        inputSchema: z.object({
            tagId: z.uuid(),
            patch: z
                .object({ name: insertTagSchema.shape.name.optional(), color: color.optional() })
                .refine((v) => v.name !== undefined || v.color !== undefined, "Nothing to change"),
        }),
        execute: async ({ tagId, patch }, { toolCallId }) =>
            safeExecute("update_tag", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const row = await updateTag(tx, userId, tagId, toHex(patch));
                        return { result: toMinimalTag(row), id: row.id };
                    }),
                ),
            ),
    }),

    delete_tag: tool({
        description: "Deletes a tag for good; it comes off every task and routine (they stay). Echo the name.",
        inputSchema: z.object({ tagId: z.uuid(), name: z.string().max(100) }),
        execute: async ({ tagId }, { toolCallId }) =>
            safeExecute("delete_tag", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const row = await deleteTag(tx, userId, tagId);
                        return { result: { deleted: row.name }, id: userId };
                    }),
                ),
            ),
    }),
});
