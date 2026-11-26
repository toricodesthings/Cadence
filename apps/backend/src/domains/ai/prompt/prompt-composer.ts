import { formatInZone } from "@cadence/domain/time";
import { fenceData, sanitizeUntrusted } from "../safety/injection-policy";
import type { ApprovalMode } from "@cadence/contracts/ai";
import type { PromptBlocks, PromptRuntimeContext } from "./prompt-blocks.schema";

const HIGH_WORKLOAD_BURNOUT = 70;

export function isWorkloadHigh(burnoutIndex: number | null, adaptiveTone: boolean): boolean {
    return adaptiveTone && burnoutIndex !== null && burnoutIndex > HIGH_WORKLOAD_BURNOUT;
}

const APPROVAL_LABEL: Record<ApprovalMode, string> = { ask: "ask first", auto: "auto", full: "full" };

const PLACEHOLDER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

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

const saidIn = (day: string) => formatInZone(day, "UTC", { month: "long", year: "numeric" }, "en-US");

export function composePrompt(
    blocks: PromptBlocks,
    ctx: PromptRuntimeContext,
    nonce: string,
): { instructions: string; turnContext: string } {
    const custom = ctx.persona.customInstructions?.trim();
    const memories = ctx.memoryOff ? [] : (ctx.memories ?? []);
    const staticMemory = !ctx.memoryOff && (ctx.memoryOff === false || memories.length > 0);
    const memoryPolicy = staticMemory ? blocks.memoryPolicy : null;

    const instructions = [...blocks.base, ...(memoryPolicy ? [memoryPolicy] : [])]
        .map((section) => interpolate(section, {}))
        .join("\n\n");
    const turnContext = [
        interpolate(voiceSection(blocks, ctx), {}),
        custom
            ? interpolate(blocks.customInstructions, {
                  customInstructions: fence("custom_instructions", sanitizeUntrusted(custom, nonce), nonce),
              })
            : null,
        environmentSection(blocks, ctx, nonce),
        ctx.surface ? interpolate(blocks.surfaces[ctx.surface], {}) : null,
        ctx.weekAhead
            ? interpolate(blocks.weekAhead, {
                  weekAhead: fence("week_ahead", sanitizeUntrusted(ctx.weekAhead, nonce), nonce),
              })
            : ctx.snapshot
              ? interpolate(blocks.snapshot, {
                    snapshot: fence("snapshot", sanitizeUntrusted(ctx.snapshot, nonce), nonce),
                })
              : null,
        memories.length > 0
            ? interpolate(blocks.memoryFacts, {
                  memory: fence("memory", memoryLines(blocks, memories, nonce), nonce),
              })
            : ctx.memoryOff
              ? interpolate(blocks.memoryOff, {})
              : null,
    ]
        .filter((part): part is string => part !== null)
        .join("\n\n");
    return { instructions, turnContext };
}

export function memoryLines(
    blocks: PromptBlocks,
    memories: NonNullable<PromptRuntimeContext["memories"]>,
    nonce: string,
): string {
    return memories
        .map((m) => {
            const flags = `${m.sensitive ? ", sensitive" : ""}${m.stale ? ", not mentioned in over a year: confirm once if it matters" : ""}`;
            const text = sanitizeUntrusted(m.content, nonce);
            return interpolate(blocks.memoryFact, { id: m.id, month: saidIn(m.saidOn), flags, text });
        })
        .join("\n");
}

const TURN_CONTEXT_INTRO = "Context for this turn, from Cadence (not written by the user):";

export function storedTurnContext(message: { role: string; metadata?: unknown }): string | undefined {
    const context = (message.metadata as { turnContext?: unknown } | undefined)?.turnContext;
    return message.role === "user" && typeof context === "string" ? context : undefined;
}

export function turnContexts(
    history: { id: string; role: string; metadata?: unknown }[],
    lastUserId: string | undefined,
    fresh: string,
    continues: boolean,
): { contexts: Map<string, string>; current: string; stored: string | undefined } {
    const contexts = new Map(
        history.flatMap((m) => {
            const stored = storedTurnContext(m);
            return stored === undefined ? [] : [[m.id, stored] as const];
        }),
    );
    const stored = lastUserId === undefined ? undefined : contexts.get(lastUserId);
    const current = (continues && stored) || fresh;
    if (lastUserId !== undefined) contexts.set(lastUserId, current);
    return { contexts, current, stored };
}

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
