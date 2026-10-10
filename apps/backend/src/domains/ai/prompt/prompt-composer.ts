/**
 * Pure, synchronous prompt composer. No I/O — all async (settings, metrics, RAG)
 * happens upstream in agent.ts. Given the same (blocks, runtime ctx, nonce) it
 * produces byte-identical output, which provider prompt caching relies on.
 *
 * Two outputs, sections joined by a blank line:
 *   instructions (system prompt): base sections only — byte-identical for every user and turn,
 *     so provider prefix caching holds it (with the tool definitions) warm across everyone.
 *   turnContext: voice (+ workload modifier) · custom instructions · Environment · snapshot · memory
 *     — per-user and per-turn, appended to the user message by `withTurnContext` and kept server-side
 *     on that message's metadata, so later turns replay it unchanged (never in its parts, never sent to the client).
 *
 * Only raw user-provided VALUES are sanitized and fenced (names, custom
 * instructions, snapshot, memory content). Every instruction is plain system text.
 */
import { fenceData, sanitizeUntrusted } from "../safety/injection-policy";
import type { ApprovalMode } from "@cadence/contracts/ai";
import type { PromptBlocks, PromptRuntimeContext } from "./prompt-blocks.schema";

/** Burnout above this (with adaptive tone on) makes the workload "high". */
const HIGH_WORKLOAD_BURNOUT = 70;

export function isWorkloadHigh(burnoutIndex: number | null, adaptiveTone: boolean): boolean {
    return adaptiveTone && burnoutIndex !== null && burnoutIndex > HIGH_WORKLOAD_BURNOUT;
}

const APPROVAL_LABEL: Record<ApprovalMode, string> = { ask: "ask first", auto: "auto", full: "full" };

/** {{token}} matcher — token is a bare identifier (letters only here). */
const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

/** Interpolate `{{placeholders}}`; an unknown token throws, naming it (fail closed). */
function interpolate(template: string, values: Record<string, string>): string {
    return template.replace(PLACEHOLDER, (_match, token: string) => {
        if (!(token in values)) throw new Error(`prompt_placeholder_unknown: {{${token}}}`);
        return values[token]!;
    });
}

function fence(kind: string, content: string, nonce: string): string {
    return fenceData({ nonce, kind, trust: "untrusted", content });
}

function voiceSection(blocks: PromptBlocks, ctx: PromptRuntimeContext): string {
    const voice = blocks.voices[ctx.persona.persona] ?? blocks.voices.secretary;
    return ctx.workloadHigh ? `${voice}\n${blocks.workloadHigh}` : voice;
}

function environmentSection(blocks: PromptBlocks, ctx: PromptRuntimeContext, nonce: string): string {
    const { persona } = ctx;
    const assistantName = persona.assistantName?.trim() || "Emilie";
    const nickname = persona.nickname?.trim();
    const names = [`Your name: ${assistantName}`, ...(nickname ? [`User's name: ${nickname}`] : [])].join("\n");
    return interpolate(blocks.environment, {
        names: fence("names", sanitizeUntrusted(names, nonce), nonce),
        emoji: persona.emoji ? "only to mirror the user" : "never",
        proactiveSuggestions: persona.proactiveSuggestions ? "on" : "off",
        approvalMode: APPROVAL_LABEL[ctx.approvalMode],
        workload: ctx.workloadHigh ? "high" : "normal",
        timezone: ctx.timezone,
        weekStart: ctx.weekStart,
        locale: ctx.locale,
        now: ctx.now,
    });
}

/** Compose the static system prompt and the per-turn context from the block set + runtime context. */
export function composePrompt(
    blocks: PromptBlocks,
    ctx: PromptRuntimeContext,
    nonce: string,
): { instructions: string; turnContext: string } {
    const custom = ctx.persona.customInstructions?.trim();
    const memories = ctx.memories ?? [];

    // Static text has no placeholders; interpolating with none fails closed on a stray one.
    const instructions = blocks.base.map((section) => interpolate(section, {})).join("\n\n");
    const turnContext = [
        interpolate(voiceSection(blocks, ctx), {}),
        custom
            ? interpolate(blocks.customInstructions, {
                  customInstructions: fence("custom_instructions", sanitizeUntrusted(custom, nonce), nonce),
              })
            : null,
        environmentSection(blocks, ctx, nonce),
        ctx.snapshot
            ? interpolate(blocks.snapshot, { snapshot: fence("snapshot", sanitizeUntrusted(ctx.snapshot, nonce), nonce) })
            : null,
        memories.length > 0
            ? interpolate(blocks.memory, {
                  memory: fence(
                      "memory",
                      memories.map((m) => `- ${sanitizeUntrusted(m.content, nonce)}`).join("\n"),
                      nonce,
                  ),
              })
            : null,
    ]
        .filter((part): part is string => part !== null)
        .join("\n\n");
    return { instructions, turnContext };
}

const TURN_CONTEXT_INTRO = "Context for this turn, from Cadence (not written by the user):";

/** The turn context a stored user message was sent with, if it kept one. */
export function storedTurnContext(message: { role: string; metadata?: unknown }): string | undefined {
    const context = (message.metadata as { turnContext?: unknown } | undefined)?.turnContext;
    return message.role === "user" && typeof context === "string" ? context : undefined;
}

/**
 * Which context each user message replays with, by id. `history` must be the stored
 * rows (never a client copy): each keeps the context it was sent with. The turn's
 * last user message gets `fresh`, unless the turn `continues` a reply (an approval,
 * a kept retry) whose message already has one: then it keeps it, so the reply
 * resumes on the same prefix. `current` is what to store on that message.
 */
export function turnContexts(
    history: { id: string; role: string; metadata?: unknown }[],
    lastUserId: string | undefined,
    fresh: string,
    continues: boolean,
): { contexts: Map<string, string>; current: string; stored: string | undefined } {
    const contexts = new Map(history.flatMap((m) => {
        const stored = storedTurnContext(m);
        return stored === undefined ? [] : [[m.id, stored] as const];
    }));
    const stored = lastUserId === undefined ? undefined : contexts.get(lastUserId);
    const current = (continues && stored) || fresh;
    if (lastUserId !== undefined) contexts.set(lastUserId, current);
    return { contexts, current, stored };
}

/**
 * Append each user message's turn context (`contexts`, by message id) as a text
 * part, for messages from `from` on (`recentStart`; older ones replay without it).
 * A message keeps the context it was first sent with, so earlier turns replay
 * byte-identical and the provider's prompt cache holds. Returns a new array (the
 * input is untouched); the stored message parts never carry it.
 * Providers may join text parts with no separator ("called Heat." + "Context…"
 * became a task named "Heat.Context"), so the part carries its own break.
 */
export function withTurnContext<M extends { id?: string; role: string; parts: unknown[] }>(
    messages: M[],
    contexts: ReadonlyMap<string, string>,
    from = 0,
): M[] {
    return messages.map((m, i) => {
        const context = i >= from && m.role === "user" && m.id !== undefined ? contexts.get(m.id) : undefined;
        if (context === undefined) return m;
        return { ...m, parts: [...m.parts, { type: "text", text: `\n\n${TURN_CONTEXT_INTRO}\n\n${context}` }] };
    });
}
