import { tool } from "ai";
import { z } from "zod";
import { and, eq, desc, inArray } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { inboxItems } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import { checkIdempotency, recordMutation } from "../../../platform/idempotency";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import { toMinimalInboxItem } from "./projections";
import { taskDraftSchema } from "./drafts";
import { inferIsAllDay } from "@cadence/domain/task-temporal";
import { processCapture } from "../../inbox/inbox.service";

export const inboxTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_inbox_items: tool({
        description:
            "Captures waiting in Capture, newest first: thoughts to sort and kept notes (isNote). " +
            "more:true when the cap cut it off.",
        inputSchema: z.object({
            includeProcessed: z.boolean().default(false).describe("Also captures already sorted or discarded."),
            limit: z.number().int().min(1).max(50).default(20),
        }),
        execute: async ({ includeProcessed, limit }) =>
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
                        })
                        .from(inboxItems)
                        .where(
                            includeProcessed
                                ? eq(inboxItems.userId, userId)
                                : and(eq(inboxItems.userId, userId), inArray(inboxItems.captureStatus, ["clarifying", "kept"])),
                        )
                        .orderBy(desc(inboxItems.createdAt), desc(inboxItems.id))
                        .limit(cap + 1),
                );
                return { items: rows.slice(0, cap).map(toMinimalInboxItem), more: rows.length > cap || undefined };
            }),
    }),

    // ── W ──────────────────────────────────────────────────────────────────
    structure_inbox_item: tool({
        description:
            "Turns a capture into a task, with its checklist steps and note; the capture leaves Capture. " +
            "No date given = the task has no date. Returns the taskId.",
        inputSchema: taskDraftSchema.omit({ sectionId: true, fixed: true }).extend({ inboxItemId: z.uuid() }),
        execute: async ({ inboxItemId, subtasks, note, fromImage: _quotes, ...draft }, { toolCallId }) =>
            safeExecute("structure_inbox_item", userId, async () => {
                const { task } = await withRls(getDbClient(env), userId, (tx) =>
                    processCapture(
                        tx,
                        userId,
                        inboxItemId,
                        {
                            ...draft,
                            // Explicit nulls: the capture's own words never add a date, list or tags.
                            dueDate: draft.dueDate ?? null,
                            scheduledStart: draft.scheduledStart ?? null,
                            isAllDay: inferIsAllDay(draft) ?? true,
                            projectId: draft.projectId ?? null,
                            tagIds: draft.tagIds ?? [],
                        },
                        { idempotencyKey: toolCallId, subtasks, note },
                    ),
                );
                return { taskId: task.id, title: task.title };
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
});
