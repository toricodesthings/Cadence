import { aiMessages } from "../../../db/schema";
import type { MessageRole, MessageStatus } from "@cadence/contracts/ai";

export type { MessageRole, MessageStatus };

export interface UIMessageLike {
    id: string;
    role: MessageRole;
    parts: unknown[];
    metadata: Record<string, unknown>;
}

export interface StoredMessage {
    id: string;
    role: MessageRole;
    parts: unknown[];
    metadata: Record<string, unknown>;
    status: MessageStatus;
    orderIndex: number;
}

export type InsertRow = typeof aiMessages.$inferInsert;

const VALID_ROLES: ReadonlySet<string> = new Set<MessageRole>(["user", "assistant", "system"]);

function coerceRole(role: string): MessageRole {
    return VALID_ROLES.has(role) ? (role as MessageRole) : "user";
}

export function applyApprovals(
    message: UIMessageLike,
    decisions: { id: string; approved: boolean; reason?: string }[],
): UIMessageLike | null {
    let matched = false;
    const parts = message.parts.map((part) => {
        const waiting = part as { state?: string; approval?: { id?: string } };
        const decision =
            waiting?.state === "approval-requested" && decisions.find((d) => d.id === waiting.approval?.id);
        if (!decision) return part;
        matched = true;
        return {
            ...waiting,
            state: "approval-responded",
            approval: {
                ...waiting.approval,
                approved: decision.approved,
                ...(decision.reason && { reason: decision.reason }),
            },
        };
    });
    return matched ? { ...message, parts } : null;
}

export function keepFinishedWrites(rows: StoredMessage[], anchorId: string): UIMessageLike | null {
    const at = rows.findIndex((row) => row.id === anchorId);
    const reply = rows[at + 1];
    if (at < 0 || at !== rows.length - 2 || reply?.role !== "assistant" || reply.status === "complete") return null;
    const finished = (part: unknown) => {
        const p = part as { type?: string; state?: string };
        return typeof p?.type === "string" && p.type.startsWith("tool-") && p.state === "output-available";
    };
    const parts = reply.parts.filter(
        (part, i) =>
            finished(part) || ((part as { type?: string })?.type === "step-start" && finished(reply.parts[i + 1])),
    );
    const wrote = parts.some((part) => finished(part) && !(part as { type: string }).type.startsWith("tool-get_"));
    return wrote ? { id: reply.id, role: reply.role, parts, metadata: reply.metadata } : null;
}

const UNANSWERED = new Set(["input-available", "approval-requested", "approval-responded"]);

export function settleUnanswered<T extends { role: string; parts: unknown[] }>(messages: T[]): T[] {
    return messages.map((message) => {
        if (message.role !== "assistant") return message;
        const parts = message.parts.flatMap((part) => {
            const call = part as { type?: string; state?: string; toolCallId?: string; approval?: { id?: string } };
            if (typeof call?.type !== "string" || !call.type.startsWith("tool-")) return [part];
            if (call.state === "input-streaming") return [];
            if (!UNANSWERED.has(call.state ?? "")) return [part];
            const approval = {
                ...call.approval,
                id: call.approval?.id ?? `unanswered-${call.toolCallId}`,
                approved: false,
                reason: "Not answered",
            };
            return [{ ...call, state: "output-denied", approval }];
        });
        return { ...message, parts };
    });
}

export function rowToUIMessage(row: StoredMessage): UIMessageLike {
    return {
        id: row.id,
        role: row.role,
        parts: row.parts,
        metadata: row.metadata,
    };
}

function userText(parts: unknown[] | undefined): string | null {
    const text = (parts ?? [])
        .map((p) =>
            p && typeof p === "object" && (p as { type?: unknown }).type === "text"
                ? String((p as { text?: unknown }).text ?? "")
                : "",
        )
        .filter(Boolean)
        .join(" ")
        .trim();
    return text || null;
}

export function uiMessageToRow(
    msg: { id: string; role: string; parts?: unknown[]; metadata?: Record<string, unknown> },
    ctx: {
        conversationId: string;
        userId: string;
        orderIndex: number;
        status: MessageStatus;
    },
): InsertRow {
    const role = coerceRole(msg.role);
    return {
        id: msg.id,
        conversationId: ctx.conversationId,
        userId: ctx.userId,
        role,
        parts: msg.parts ?? [],
        searchText: role === "user" ? userText(msg.parts) : null,
        metadata: msg.metadata ?? {},
        status: ctx.status,
        orderIndex: ctx.orderIndex,
    };
}

export function nextOrderIndex(lastOrderIndex: number | null): number {
    return (lastOrderIndex ?? 0) + 1;
}

const SIGNED_REASONING_FORMATS: ReadonlySet<string> = new Set(["anthropic-claude-v1", "google-gemini-v1"]);

function keepReasoningDetail(detail: unknown): boolean {
    const d = detail as { type?: string; format?: string; signature?: string };
    if (d?.type !== "reasoning.text") return true;
    if (!SIGNED_REASONING_FORMATS.has(d.format ?? "anthropic-claude-v1")) return true;
    return !!d.signature;
}

function cleanMeta(meta: unknown, keep: (detail: unknown) => boolean): unknown {
    const details = (meta as { openrouter?: { reasoning_details?: unknown } } | undefined)?.openrouter
        ?.reasoning_details;
    if (!Array.isArray(details)) return meta;
    const m = meta as { openrouter: Record<string, unknown> };
    return { ...m, openrouter: { ...m.openrouter, reasoning_details: details.filter(keep) } };
}

function filterReasoning<T extends { parts: unknown[] }>(msg: T, keep: (detail: unknown) => boolean): T {
    return {
        ...msg,
        parts: msg.parts.map((part) => {
            const p = part as { providerMetadata?: unknown; callProviderMetadata?: unknown };
            if (!p || typeof p !== "object" || (!p.providerMetadata && !p.callProviderMetadata)) return part;
            return {
                ...p,
                ...(p.providerMetadata ? { providerMetadata: cleanMeta(p.providerMetadata, keep) } : {}),
                ...(p.callProviderMetadata ? { callProviderMetadata: cleanMeta(p.callProviderMetadata, keep) } : {}),
            };
        }),
    };
}

export function dropUnsignedReasoning<T extends { parts: unknown[] }>(messages: T[]): T[] {
    return messages.map((msg) => filterReasoning(msg, keepReasoningDetail));
}

export function dropForeignReasoning<T extends { parts: unknown[]; metadata?: unknown }>(
    messages: T[],
    modelId: string,
): T[] {
    return messages.map((msg) => {
        const producedBy = (msg.metadata as { model?: unknown } | undefined)?.model;
        if (typeof producedBy !== "string" || producedBy === modelId) return msg;
        return filterReasoning(msg, () => false);
    });
}

function compactReadPart(part: unknown): unknown {
    const p = part as { type?: unknown; state?: unknown; output?: unknown };
    if (typeof p?.type !== "string" || !p.type.startsWith("tool-get_") || p.state !== "output-available") return part;
    if (!p.output || typeof p.output !== "object" || Array.isArray(p.output)) return part;
    const output = Object.fromEntries(
        Object.entries(p.output).map(([key, value]) =>
            Array.isArray(value) && value.length && value.every((row) => row && typeof row === "object" && "id" in row)
                ? [key, { count: value.length, ids: value.map((row) => (row as { id: unknown }).id) }]
                : [key, value],
        ),
    );
    return { ...p, output };
}

export const COMPACT_EVERY_TURNS = 4;

export function recentStart(messages: { role: string }[]): number {
    const users = messages.flatMap((m, i) => (m.role === "user" ? [i] : []));
    const current = users.length - 1;
    if (current <= 0) return 0;
    return users[Math.floor((current - 1) / COMPACT_EVERY_TURNS) * COMPACT_EVERY_TURNS]!;
}

export function compactOldReads<T extends { role: string; parts: unknown[] }>(
    messages: T[],
    from = recentStart(messages),
): T[] {
    return messages.map((msg, i) =>
        msg.role !== "assistant" || i >= from ? msg : { ...msg, parts: msg.parts.map(compactReadPart) },
    );
}

export function toClientMessage(row: StoredMessage): UIMessageLike {
    const { turnContext: _, ...metadata } = row.metadata ?? {};
    return { ...rowToUIMessage(row), metadata };
}
