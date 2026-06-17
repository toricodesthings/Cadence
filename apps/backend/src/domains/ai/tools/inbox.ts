import { tool } from "ai";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { getDbClient } from "../../../platform/db";
import { inboxItems } from "../../../db/schema";
import { withRls } from "../../../platform/rls";
import { checkIdempotency, recordMutation } from "../../../platform/idempotency";
import type { Env } from "../../../types/env";
import type { AgentContext } from "./index";
import { safeExecute, clampLimit } from "./index";
import { toMinimalInboxItem } from "./projections";

export const inboxTools = (env: Env, userId: string, _ctx: AgentContext) => ({
    // ── R ──────────────────────────────────────────────────────────────────
    get_inbox_items: tool({
        description:
            "READ-ONLY. Fetch unprocessed inbox captures (rawText, captureKind, captureStatus, " +
            "processed). These are the user's raw, unstructured thoughts awaiting triage. " +
            "Hard-capped server-side.",
        inputSchema: z.object({
            includeProcessed: z
                .boolean()
                .default(false)
                .describe("Include already-processed captures too."),
            limit: z.number().int().min(1).max(50).default(20).describe("Max rows (capped at 50)."),
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
                                : and(eq(inboxItems.userId, userId), eq(inboxItems.processed, false)),
                        )
                        .orderBy(desc(inboxItems.createdAt))
                        .limit(cap),
                );
                return { items: rows.map(toMinimalInboxItem) };
            }),
    }),

    // ── P (proposal — NO DB WRITE) ──────────────────────────────────────────
    propose_structure_inbox_item: tool({
        description:
            "PROPOSAL ONLY — does NOT write anything. Turns a messy capture into a structured task " +
            "draft for confirmation; the task is created (and the capture placed) later via REST. " +
            "Use YYYY-MM-DD for all-day dueDate values; use ISO datetimes with Z or +/-HH:MM offsets for time blocks. " +
            "Duration is in minutes.",
        inputSchema: z.object({
            inboxItemId: z.string().uuid().describe("Source capture id."),
            title: z.string().min(1).max(500).describe("Cleaned task title."),
            content: z.string().max(5000).optional().describe("Optional note body."),
            dueDate: z.string().optional().describe("Deadline. For all-day tasks use YYYY-MM-DD."),
            scheduledStart: z.string().optional().describe("Block start. Use an ISO datetime with Z or +/-HH:MM offset."),
            durationEstimate: z.number().int().min(1).max(1440).optional().describe("Minutes."),
            projectId: z.string().uuid().optional().describe("Re-validated on confirm."),
            tagIds: z.array(z.string().uuid()).max(20).optional().describe("Re-validated on confirm."),
        }),
    }),

    // ── P ────────────────────────────────────────────────────────────────────
    propose_cluster_inbox: tool({
        description:
            "PROPOSAL ONLY — does NOT write anything. Suggests grouping related captures into a " +
            "(possibly new) project; returns the cluster plan for confirmation. Real grouping " +
            "happens later via REST.",
        inputSchema: z.object({
            projectName: z.string().min(1).max(200).describe("Proposed/target project name."),
            existingProjectId: z
                .string()
                .uuid()
                .optional()
                .describe("If clustering into an existing project, its id (re-validated on confirm)."),
            inboxItemIds: z
                .array(z.string().uuid())
                .min(1)
                .max(50)
                .describe("Captures to group together."),
        }),
    }),

    // ── W (safe additive write — ONLY directly-writing tool) ──────────────────
    capture_to_inbox: tool({
        description:
            "WRITES IMMEDIATELY. Drops a raw thought into the user's inbox as a new capture. This " +
            "is the ONLY tool that writes to the database directly — it is safe, reversible, and " +
            "additive (mirrors quick-capture). Pass a stable clientMutationId to make it idempotent " +
            "(replays return the existing capture instead of duplicating).",
        inputSchema: z.object({
            rawText: z.string().min(1).max(5000).describe("The raw thought to capture, verbatim."),
            captureKind: z
                .enum(["task", "thought", "reference", "unknown"])
                .default("unknown")
                .describe("Coarse kind hint."),
            clientMutationId: z
                .string()
                .min(8)
                .max(200)
                .describe("Stable idempotency key for this capture (e.g. a UUID)."),
        }),
        execute: async ({ rawText, captureKind, clientMutationId }) =>
            safeExecute("capture_to_inbox", userId, async () => {
                const db = getDbClient(env);
                return withRls(db, userId, async (tx) => {
                    const existingId = await checkIdempotency(tx, userId, clientMutationId);
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

                    await recordMutation(tx, userId, clientMutationId, row.id);
                    return { item: row, deduped: false as const };
                });
            }),
    }),
});
