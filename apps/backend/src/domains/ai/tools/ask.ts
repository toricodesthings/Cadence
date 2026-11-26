import { tool } from "ai";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { fieldAskOpen, settleFieldAsk, type FieldAskState } from "@cadence/domain/field-ask";
import { users } from "../../../db/schema";
import { getDbClient } from "../../../platform/db";
import { withRls } from "../../../platform/rls";
import type { Env } from "../../../types/env";
import type { Tx } from "../../../types/db";
import type { AgentContext } from "./index";

const fieldAskOf = (settings: unknown) =>
    (settings as { assistant?: { fieldAsk?: FieldAskState | null } } | null)?.assistant?.fieldAsk ?? null;

const FIELD_CUES = {
    priority: /\b(?:matters? most|most important|priorit)/i,
    effort: /\b(?:heaviest|hardest|most effort|biggest)\b/i,
};
const fieldOf = (question: string, field?: "priority" | "effort") =>
    field ??
    (FIELD_CUES.priority.test(question) ? "priority" : FIELD_CUES.effort.test(question) ? "effort" : undefined);

const writeFieldAsk = (tx: Tx, userId: string, value: FieldAskState) =>
    tx
        .update(users)
        .set({
            settings: sql`coalesce(${users.settings}, '{}'::jsonb) || jsonb_build_object('assistant', coalesce(${users.settings}->'assistant', '{}'::jsonb) || jsonb_build_object('fieldAsk', ${JSON.stringify(value)}::jsonb))`,
        })
        .where(eq(users.id, userId));

export async function settleFieldQuestion(tx: Tx, userId: string, settings: unknown, reply: string) {
    const settled = settleFieldAsk(fieldAskOf(settings), reply);
    if (!settled) return undefined;
    await writeFieldAsk(tx, userId, settled.state);
    return settled.answered;
}

export const askTools = (env: Env, userId: string, ctx: AgentContext) => ({
    ask_user: tool({
        description:
            "Asks the user one short question and ends your turn: use it instead of guessing a detail you'd act on (which item, list, day or time). " +
            "The card shows the question, your options to tap, and a box to type their own answer; their reply is the next message. Don't repeat the question in text.",
        inputSchema: z.object({
            question: z.string().min(1).max(200).describe("One plain question."),
            options: z
                .array(
                    z.object({
                        label: z.string().min(1).max(60).describe("A short answer they can tap."),
                        description: z
                            .string()
                            .max(120)
                            .optional()
                            .describe("What it means, when the label isn't enough."),
                    }),
                )
                .min(2)
                .max(4)
                .describe("The likely answers, most likely first. They can always type their own."),
            field: z
                .enum(["priority", "effort"])
                .optional()
                .describe('Set for "Which matters most today?" (priority) or "Which is heaviest?" (effort).'),
        }),
        execute: async ({ question, options, field: given }) => {
            const field = fieldOf(question, given);
            if (!field) return { asked: true };
            return withRls(getDbClient(env), userId, async (tx) => {
                const [row] = await tx
                    .select({ settings: users.settings })
                    .from(users)
                    .where(eq(users.id, userId))
                    .limit(1);
                const state = fieldAskOf(row?.settings) ?? {};
                const entry = state[field];
                if (!fieldAskOpen(entry, ctx.today))
                    return {
                        asked: false,
                        reason: "They skipped this question recently: don't ask; carry on without it.",
                    };
                await writeFieldAsk(tx, userId, {
                    ...state,
                    [field]: { lastOn: ctx.today, misses: entry?.misses ?? 0, labels: options.map((o) => o.label) },
                });
                return { asked: true };
            });
        },
    }),
});
