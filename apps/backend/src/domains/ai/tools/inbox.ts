import { tool } from "ai";
import { z } from "zod";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { inboxItems } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import { AppError, throwIfNotFound } from "../../../platform/errors";
import { checkIdempotency, recordMutation } from "../../../platform/idempotency";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit, once } from "./index";
import { toMinimalInboxItem } from "./projections";
import { NOTE_READ_LIMIT } from "./drafts";
import { deleteCaptures, processCapture, unprocessCapture, updateCapture } from "../../inbox/inbox.service";
import { insertInboxItemSchema } from "@cadence/contracts/inbox";

export const inboxTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_inbox_items: tool({
        description:
            "Captures in Capture, newest first: thoughts to sort and kept notes (isNote). A placed one carries the taskId it became. " +
            "more:true and nextOffset when there's more.",
        inputSchema: z.object({
            includeProcessed: z.boolean().default(false).describe("Also captures already placed, ticked off or discarded."),
            offset: z.number().int().min(0).max(100_000).optional().describe("From nextOffset; omit for the first page."),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ includeProcessed, offset = 0, limit }) =>
            safeExecute("get_inbox_items", userId, async () => {
                const cap = clampLimit(limit);
                const db = getDbClient(env);
                const rows = await withRls(db, userId, async (tx) =>
                    tx
                        .select({
                            id: inboxItems.id,
                            rawText: inboxItems.rawText,
                            captureKind: inboxItems.captureKind,
                            captureStatus: inboxItems.captureStatus,
                            processed: inboxItems.processed,
                            placedTaskId: inboxItems.placedTaskId,
                        })
                        .from(inboxItems)
                        .where(
                            includeProcessed
                                ? eq(inboxItems.userId, userId)
                                : and(eq(inboxItems.userId, userId), inArray(inboxItems.captureStatus, ["clarifying", "kept"])),
                        )
                        .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id))
                        .limit(cap + 1)
                        .offset(offset),
                );
                const more = rows.length > cap;
                return { items: rows.slice(0, cap).map(toMinimalInboxItem), ...(more && { more, nextOffset: offset + cap }) };
            }),
    }),

    // ── W (additive: never waits for approval) ──────────────────────────────
    capture_to_inbox: tool({
        description:
            "Saves a thought to Capture right away (no approval: it's additive and can be discarded). Returns its id.",
        inputSchema: z.object({
            rawText: z.string().min(1).max(5000).describe("The thought, verbatim."),
            captureKind: z.enum(["task", "thought", "reference", "unknown"]).default("unknown"),
        }),
        // The tool call's own id is the idempotency key: a replayed call returns its
        // capture, and a new call can never merge into an older one.
        execute: async ({ rawText, captureKind }, { toolCallId }) =>
            safeExecute("capture_to_inbox", userId, async () => {
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const existingId = await checkIdempotency(tx, userId, toolCallId);
                    if (existingId) {
                        const [existing] = await tx
                            .select({ id: inboxItems.id, rawText: inboxItems.rawText })
                            .from(inboxItems)
                            .where(
                                and(eq(inboxItems.id, existingId), eq(inboxItems.userId, userId)),
                            );
                        if (existing) {
                            return { item: existing, deduped: true as const };
                        }
                    }

                    const [row] = await tx
                        .insert(inboxItems)
                        .values({ userId, rawText, captureKind })
                        .returning({ id: inboxItems.id, rawText: inboxItems.rawText });

                    await recordMutation(tx, userId, toolCallId, row.id);
                    return { item: row, deduped: false as const };
                });
            }),
    }),

    // ── U ──────────────────────────────────────────────────────────────────
    update_captures: tool({
        description:
            "Changes 1–50 captures: new words, and/or an action: note (keep as a note), discard, done (tick off: " +
            "it goes to Completed), or new (back to New, the Undo for any of these; a task it became goes to Trash). Returns each result.",
        inputSchema: z.object({
            items: z.array(z.object({
                inboxItemId: z.uuid(),
                text: insertInboxItemSchema.shape.rawText.optional().describe(`The capture's new words (only for one read whole: ≤${NOTE_READ_LIMIT} characters).`),
                action: z.enum(["note", "discard", "done", "new"]).optional(),
            }).refine((v) => v.text !== undefined || v.action !== undefined, "Send text or an action")).min(1).max(50),
        }),
        execute: async ({ items }, { toolCallId }) =>
            safeExecute("update_captures", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const results: { inboxItemId: string; status: string; taskId?: string }[] = [];
                        for (const { inboxItemId, text, action } of items) {
                            // Like notes: a capture shown cut short can't be rewritten from that copy.
                            if (text !== undefined) {
                                const [current] = await tx
                                    .select({ length: sql<number>`length(${inboxItems.rawText})` })
                                    .from(inboxItems)
                                    .where(and(eq(inboxItems.id, inboxItemId), eq(inboxItems.userId, userId)));
                                if (current && current.length > NOTE_READ_LIMIT) {
                                    throw new AppError(400, "VALIDATION_ERROR", "That capture is too long to rewrite whole");
                                }
                            }
                            if (action === "new") await unprocessCapture(tx, userId, inboxItemId);
                            if (action === "done") {
                                const [capture] = await tx
                                    .select({ rawText: inboxItems.rawText })
                                    .from(inboxItems)
                                    .where(and(eq(inboxItems.id, inboxItemId), eq(inboxItems.userId, userId)));
                                throwIfNotFound(capture, "Inbox item");
                                if (text !== undefined) await updateCapture(tx, userId, inboxItemId, { rawText: text });
                                const { task } = await processCapture(tx, userId, inboxItemId, { title: text ?? capture.rawText, complete: true });
                                results.push({ inboxItemId, status: "done", taskId: task.id });
                                continue;
                            }
                            const status = action === "note" ? "kept" as const : action === "discard" ? "discarded" as const : undefined;
                            const change = { ...(text !== undefined && { rawText: text }), ...(status && { captureStatus: status }) };
                            const row = Object.keys(change).length ? await updateCapture(tx, userId, inboxItemId, change) : undefined;
                            results.push({ inboxItemId, status: row?.captureStatus ?? "clarifying" });
                        }
                        return { result: { results }, id: items[0].inboxItemId };
                    }),
                ),
            ),
    }),

    // ── D ──────────────────────────────────────────────────────────────────
    delete_captures: tool({
        description:
            "Deletes 1–50 captures for good (can't be undone; discard is the restorable way). Tasks made from them stay. " +
            "Echo each text. Returns how many were deleted.",
        inputSchema: z.object({
            items: z.array(z.object({ inboxItemId: z.uuid(), text: z.string().max(5000) })).min(1).max(50),
        }),
        execute: async ({ items }, { toolCallId }) =>
            safeExecute("delete_captures", userId, async () =>
                withRls(getDbClient(env), userId, (tx) =>
                    once(tx, userId, toolCallId, async () => {
                        const rows = await deleteCaptures(tx, userId, items.map((item) => item.inboxItemId));
                        return { result: { deleted: rows.length }, id: userId };
                    }),
                ),
            ),
    }),
});
