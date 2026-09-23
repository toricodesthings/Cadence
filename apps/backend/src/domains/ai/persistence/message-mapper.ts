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

/** Reasoning formats whose plain-text entries need a signature to be replayed. */
const SIGNED_REASONING_FORMATS: ReadonlySet<string> = new Set(["anthropic-claude-v1", "google-gemini-v1"]);

function keepReasoningDetail(detail: unknown): boolean {
    const d = detail as { type?: string; format?: string; signature?: string };
    // Same rule (and same default format) the OpenRouter provider applies on replay.
    if (d?.type !== "reasoning.text") return true;
    if (!SIGNED_REASONING_FORMATS.has(d.format ?? "anthropic-claude-v1")) return true;
    return !!d.signature;
}

function cleanMeta(meta: unknown): unknown {
    const details = (meta as { openrouter?: { reasoning_details?: unknown } } | undefined)?.openrouter?.reasoning_details;
    if (!Array.isArray(details)) return meta;
    const m = meta as { openrouter: Record<string, unknown> };
    return { ...m, openrouter: { ...m.openrouter, reasoning_details: details.filter(keepReasoningDetail) } };
}

/**
 * Drop unsigned reasoning summaries (Gemini/Claude `reasoning.text` without a
 * signature) from history before it goes back to the model. The provider would
 * strip them anyway — with a console warning every turn (openrouter
 * ai-sdk-provider #418/#423). Signed + encrypted entries (thought signatures
 * that tool calls depend on) are kept.
 */
export function dropUnsignedReasoning<T extends { parts: unknown[] }>(messages: T[]): T[] {
    return messages.map((msg) => ({
        ...msg,
        parts: msg.parts.map((part) => {
            const p = part as { providerMetadata?: unknown; callProviderMetadata?: unknown };
            if (!p || typeof p !== "object" || (!p.providerMetadata && !p.callProviderMetadata)) return part;
            return {
                ...p,
                ...(p.providerMetadata ? { providerMetadata: cleanMeta(p.providerMetadata) } : {}),
                ...(p.callProviderMetadata ? { callProviderMetadata: cleanMeta(p.callProviderMetadata) } : {}),
            };
        }),
    }));
}
