/**
 * Pure row <-> UIMessage mapper for AI conversation persistence.
 *
 * We persist Vercel AI SDK `UIMessage` fidelity (`{ id, role, parts, metadata }`)
 * — NEVER ModelMessages (see docs/ai_upgrade/08). One DB row per UIMessage; the
 * `parts` and `metadata` arrays/objects are stored verbatim as jsonb. `status`
 * and `orderIndex` are persistence-only columns and are dropped when
 * reconstructing the UIMessage for the client.
 *
 * Everything here is PURE (no IO, no clock, no randomness) so it is trivially
 * unit-testable and safe to call from inside an RLS transaction.
 */
import { aiMessages } from "../../../db/schema";
import type { MessageRole, MessageStatus } from "@cadence/contracts/ai";

/** The two enums we coerce into — canonical in @cadence/contracts/ai. */
export type { MessageRole, MessageStatus };

/** Narrow structural UIMessage shape — avoids generic friction with the SDK's `UIMessage<…>`. */
export interface UIMessageLike {
    id: string;
    role: MessageRole;
    parts: unknown[];
    metadata: Record<string, unknown>;
}

/** A persisted `ai_messages` row projected to the fields the mapper cares about. */
export interface StoredMessage {
    id: string;
    role: MessageRole;
    parts: unknown[];
    metadata: Record<string, unknown>;
    status: MessageStatus;
    orderIndex: number;
}

/** The insert payload accepted by `db.insert(aiMessages).values(...)`. */
export type InsertRow = typeof aiMessages.$inferInsert;

const VALID_ROLES: ReadonlySet<string> = new Set<MessageRole>(["user", "assistant", "system"]);

/** Coerce an arbitrary string into the role enum, defaulting unknown values to 'user'. */
function coerceRole(role: string): MessageRole {
    return VALID_ROLES.has(role) ? (role as MessageRole) : "user";
}

/**
 * Reconstruct a render-faithful UIMessage from a DB row. Drops the
 * persistence-only `status`/`orderIndex` and keeps id/role/parts/metadata.
 */
export function rowToUIMessage(row: StoredMessage): UIMessageLike {
    return {
        id: row.id,
        role: row.role,
        parts: row.parts,
        metadata: row.metadata,
    };
}

/**
 * Produce the `ai_messages` insert payload for a UIMessage. Coerces role to the
 * enum and defaults missing `parts` to `[]` and `metadata` to `{}`.
 */
export function uiMessageToRow(
    msg: { id: string; role: string; parts?: unknown[]; metadata?: Record<string, unknown> },
    ctx: {
        conversationId: string;
        userId: string;
        orderIndex: number;
        status: MessageStatus;
    },
): InsertRow {
    return {
        id: msg.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        role: coerceRole(msg.role),
        parts: msg.parts ?? [],
        metadata: msg.metadata ?? {},
        status: ctx.status,
        orderIndex: ctx.orderIndex,
    };
}

/**
 * Next fractional ordering index within a thread. Mirrors the tasks/subtasks
 * doublePrecision convention — a plain increment keeps appends/retries from
 * renumbering the whole conversation.
 */
export function nextOrderIndex(lastOrderIndex: number | null): number {
    return (lastOrderIndex ?? 0) + 1;
}
