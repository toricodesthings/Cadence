/// <reference path="../../../types/text-modules.d.ts" />
/**
 * The assistant's system prompt, as markdown files in ./blocks: base/ (identity,
 * rules, output and tool policy), context/ (per-turn data), style/ (persona, tone). Git is the only
 * source of truth: edit a file and push — the deploy ships it. The composer
 * interpolates {{placeholders}}; an unknown one throws (caught by the tests).
 *
 * Base order is load-bearing: identity, safety, operating_principles,
 * output_contract, tool_policy. Auxiliary blocks follow, lower authority.
 */
import type { CompiledPromptBlocks, PromptBlock } from "./prompt-blocks.schema";
import identity from "./blocks/base/identity.md";
import safety from "./blocks/base/safety.md";
import operatingPrinciples from "./blocks/base/operating-principles.md";
import outputContract from "./blocks/base/output-contract.md";
import toolPolicy from "./blocks/base/tool-policy.md";
import runtimeContext from "./blocks/context/runtime-context.md";
import humanMetrics from "./blocks/context/human-metrics.md";
import personaCustomization from "./blocks/style/persona-customization.md";
import retrievedMemory from "./blocks/context/retrieved-memory.md";
import workspaceSnapshot from "./blocks/context/workspace-snapshot.md";
import toneNeutral from "./blocks/style/tone-neutral.md";
import toneProtective from "./blocks/style/tone-protective.md";

const block = (kind: PromptBlock["kind"], layer: PromptBlock["layer"], template: string): PromptBlock =>
    ({ kind, layer, template: template.trimEnd() });

export const PROMPT_BLOCKS: CompiledPromptBlocks = {
    base: [
        block("identity", "base", identity),
        block("safety", "base", safety),
        block("operating_principles", "base", operatingPrinciples),
        block("output_contract", "base", outputContract),
        block("tool_policy", "base", toolPolicy),
    ],
    auxiliary: [
        block("runtime_context", "auxiliary", runtimeContext),
        block("human_metrics", "auxiliary", humanMetrics),
        block("persona_customization", "auxiliary", personaCustomization),
        block("retrieved_memory", "auxiliary", retrievedMemory),
        block("workspace_snapshot", "auxiliary", workspaceSnapshot),
        block("tone_neutral", "auxiliary", toneNeutral),
        block("tone_protective", "auxiliary", toneProtective),
    ],
};
