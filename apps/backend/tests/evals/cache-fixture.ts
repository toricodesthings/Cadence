import type { ToolSet } from "ai";
import { SETTINGS_DEFAULTS } from "@cadence/contracts/settings";
import { CACHE_VARIANTS, chatTools, type CacheVariant } from "../../src/domains/ai/agent";
import { buildToolRegistry } from "../../src/domains/ai/tools";
import { composePrompt } from "../../src/domains/ai/prompt/prompt-composer";
import { PROMPT_BLOCKS } from "../../src/domains/ai/prompt/prompt-blocks";
import type { Env } from "../../src/types/env";
import type { AssistantPersona } from "../../src/domains/ai/prompt/prompt-blocks.schema";

/** Shared by initial and delayed probes so a checkpoint reuses the same static bytes. */
export function cacheFixture(env: Env, run: string, variant: CacheVariant, memoryOn: boolean, epoch = "a", persona: Partial<AssistantPersona> = {}) {
    const prompt = composePrompt(PROMPT_BLOCKS, {
        timezone: "America/Toronto", now: "2026-10-13 14:00 -04:00 (Tuesday)", locale: "en-CA", weekStart: "Monday",
        approvalMode: "full", workloadHigh: false, persona: { ...SETTINGS_DEFAULTS.assistant, ...persona, memoryMode: memoryOn ? "basic" : "off" },
        memoryOff: !memoryOn, snapshot: '{"schedule":{"tasks":[]},"routines":[],"overdue":{"tasks":[]},"capture":{"items":[]}}',
        memories: memoryOn ? [{ id: "synthetic-fact", content: "Friday evenings stay free", saidOn: "2026-08-12", sensitive: false }] : [],
    }, "cacheprobe");
    // Equal-length per-variant namespaces prevent one candidate warming another.
    const instructions = `Cache experiment ${run} group ${CACHE_VARIANTS.indexOf(variant)} epoch ${epoch}.\n\n${prompt.instructions}`;
    const registry = chatTools(buildToolRegistry(env, "synthetic", {
        timezone: "America/Toronto", today: "2026-10-13", currentDate: "2026-10-13T18:00:00Z", nullableOptionals: false,
    }), memoryOn);
    const tools: ToolSet = Object.fromEntries(Object.entries(registry).map(([name, t]) => [name, { ...t, execute: undefined }]));
    return { instructions, context: prompt.turnContext, tools };
}
