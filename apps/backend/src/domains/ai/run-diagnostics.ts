import type {
    GenerateTextEndEvent, GenerateTextStepEndEvent, GenerateTextStepStartEvent,
    LanguageModelCallEndEvent, LanguageModelCallStartEvent, LanguageModelUsage,
    ToolExecutionEndEvent, ToolExecutionStartEvent,
} from "ai";
import { version } from "../../../../../package.json";

/** Server-only, content-free observations. Not a billing ledger or upstream routing trace. */
type Span = { startMs: number; endMs?: number };
type Phase = "admission" | "zoneRecallQuery" | "historyPersist" | "settings" | "profile" | "embedding" | "recall" | "snapshot" | "images" | "resumeInit" | "contextValidation" | "prompt" | "promptHash";
type Usage = {
    inputTokens: number | null; ordinaryInputTokens: number | null;
    cacheReadTokens: number | null; cacheWriteTokens: number | null;
    outputTokens: number | null; reasoningTokens: number | null;
};
type ModelCall = Span & {
    ordinal: number; step: number | null; requestedModel: string | null;
    sdkProvider: string | null; servedModel: string | null; generationId: string | null;
    firstOutputMs: number | null; finishReason: string | null; usage: Usage | null; costUsd: number | null;
};
type ToolExecution = Span & { step: number | null; name: string | null; outcome: "unknown" | "complete" | "failed"; durationMs: number | null };
type Step = Span & { ordinal: number; toolCalls: number | null; finishReason: string | null };

// Independent caps: even retries, malformed providers and parallel tools stay bounded.
const MAX_ENTRIES = 64;
const identifier = (value: unknown): string | null => typeof value === "string" && /^[\w./:@+-]{1,128}$/.test(value) ? value : null;
const numeric = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

function usageFields(usage: LanguageModelUsage): Usage {
    const input = numeric(usage.inputTokens), read = numeric(usage.inputTokenDetails?.cacheReadTokens), write = numeric(usage.inputTokenDetails?.cacheWriteTokens);
    return {
        inputTokens: input,
        // Some provider noCache counters include cache writes. Keep the categories disjoint.
        ordinaryInputTokens: input !== null && read !== null && write !== null && input >= read + write ? input - read - write : null,
        cacheReadTokens: read,
        cacheWriteTokens: write,
        outputTokens: numeric(usage.outputTokens),
        reasoningTokens: numeric(usage.outputTokenDetails?.reasoningTokens),
    };
}

/** Only the exact OpenRouter charge is accepted. Never copy provider metadata. */
function exactCost(metadata: unknown): number | null {
    return numeric((metadata as { openrouter?: { usage?: { cost?: unknown } } } | undefined)?.openrouter?.usage?.cost);
}

export function createRunDiagnostics(clock: () => number) {
    const phases: (Span & { name: Phase })[] = [];
    const steps: Step[] = [];
    const modelCalls: ModelCall[] = [];
    const tools: ToolExecution[] = [];
    const activeTools = new Map<string, ToolExecution>();
    let activeStep: Step | undefined;
    let activeModelCall: ModelCall | undefined;
    let stepOrdinal: number | null = null;
    let generationEndMs: number | null = null;
    let droppedEntries = 0;
    let memory: { hasRecallCandidates: boolean; profileFacts: number } | undefined;
    const runId = crypto.randomUUID();
    const now = () => numeric(clock()) ?? 0;

    function beginPhase(name: Phase) {
        const span = { name, startMs: now() } as (typeof phases)[number];
        if (phases.length < MAX_ENTRIES) phases.push(span);
        else droppedEntries++;
        return () => { span.endMs ??= now(); };
    }
    async function measure<T>(name: Phase, work: () => Promise<T>): Promise<T> {
        const end = beginPhase(name);
        try { return await work(); } finally { end(); }
    }

    const hooks = {
        onStepStart(event: GenerateTextStepStartEvent) {
            stepOrdinal = event.stepNumber;
            activeStep = undefined;
            if (steps.length >= MAX_ENTRIES) { droppedEntries++; return; }
            activeStep = { ordinal: event.stepNumber, startMs: now(), toolCalls: null, finishReason: null };
            steps.push(activeStep);
        },
        onStepEnd(event: GenerateTextStepEndEvent) {
            if (!activeStep || activeStep.ordinal !== event.stepNumber) return;
            activeStep.endMs = now();
            activeStep.toolCalls = event.toolCalls.length;
            activeStep.finishReason = identifier(event.finishReason);
        },
        onLanguageModelCallStart(event: LanguageModelCallStartEvent) {
            // The SDK's callId identifies the generation, not an individual retry.
            // A start without an end remains incomplete; no invented usage or failure time.
            activeModelCall = undefined;
            if (modelCalls.length >= MAX_ENTRIES) { droppedEntries++; return; }
            activeModelCall = {
                ordinal: modelCalls.length, step: stepOrdinal, startMs: now(),
                requestedModel: identifier(event.modelId), sdkProvider: identifier(event.provider),
                servedModel: null, generationId: null, firstOutputMs: null,
                finishReason: null, usage: null, costUsd: null,
            };
            modelCalls.push(activeModelCall);
        },
        onLanguageModelCallEnd(event: LanguageModelCallEndEvent) {
            if (!activeModelCall) return;
            activeModelCall.endMs = now();
            activeModelCall.generationId = identifier(event.responseId);
            activeModelCall.servedModel = identifier(event.modelId);
            activeModelCall.finishReason = identifier(event.finishReason);
            activeModelCall.usage = usageFields(event.usage);
            activeModelCall.costUsd = exactCost(event.providerMetadata);
            // SDK-visible response model; OpenRouter's internal provider remains unknown.
            const first = numeric(event.performance.timeToFirstOutputMs);
            activeModelCall.firstOutputMs = first === null ? null : activeModelCall.startMs + first;
        },
        onToolExecutionStart(event: ToolExecutionStartEvent) {
            if (tools.length >= MAX_ENTRIES) { droppedEntries++; return; }
            const entry: ToolExecution = { step: stepOrdinal, name: identifier(event.toolCall.toolName), startMs: now(), outcome: "unknown", durationMs: null };
            tools.push(entry);
            activeTools.set(event.toolCall.toolCallId, entry);
        },
        onToolExecutionEnd(event: ToolExecutionEndEvent) {
            const entry = activeTools.get(event.toolCall.toolCallId);
            if (!entry) return;
            entry.endMs = now();
            entry.durationMs = numeric(event.toolExecutionMs);
            entry.outcome = event.toolOutput.type === "tool-error" ? "failed" : "complete";
            activeTools.delete(event.toolCall.toolCallId);
        },
        onEnd(_event: GenerateTextEndEvent) { generationEndMs = now(); },
    };

    function snapshot() {
        const completeCost = modelCalls.length > 0 && droppedEntries === 0 && modelCalls.every((call) => call.endMs !== undefined && call.costUsd !== null);
        return {
            revision: 1, runId, appRelease: version,
            coverage: "sdk_observed" as const, generationEndMs, droppedEntries, memoryCoverage: memory && { ...memory },
            exactCostUsd: completeCost ? modelCalls.reduce((sum, call) => sum + call.costUsd!, 0) : null,
            phases: phases.map((entry) => ({ ...entry })),
            steps: steps.map((entry) => ({ ...entry })),
            modelCalls: modelCalls.map((entry) => ({ ...entry, usage: entry.usage && { ...entry.usage } })),
            tools: tools.map((entry) => ({ ...entry })),
        };
    }
    return { runId, beginPhase, measure, hooks, snapshot,
        memoryCoverage(value: NonNullable<typeof memory>) { memory = { ...value }; },
    };
}

export type RunDiagnostics = ReturnType<typeof createRunDiagnostics>;
