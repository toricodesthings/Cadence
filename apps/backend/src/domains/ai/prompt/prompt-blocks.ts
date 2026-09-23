/// <reference path="../../../types/text-modules.d.ts" />
/**
 * The assistant's system prompt, as markdown files in ./blocks. Git is the only
 * source of truth: edit a file and push — the deploy ships it. The composer
 * interpolates {{placeholders}}; an unknown one throws (caught by the tests).
 *
 * Base order is load-bearing: identity, safety, operating_principles,
 * output_contract, tool_policy. Auxiliary blocks follow, lower authority.
 */
import type { CompiledPromptBlocks, PromptBlock } from "./prompt-blocks.schema";
import identity from "./blocks/identity.md";
import safety from "./blocks/safety.md";
import operatingPrinciples from "./blocks/operating-principles.md";
import outputContract from "./blocks/output-contract.md";
import toolPolicy from "./blocks/tool-policy.md";
import runtimeContext from "./blocks/runtime-context.md";
import humanMetrics from "./blocks/human-metrics.md";
import personaCustomization from "./blocks/persona-customization.md";
import retrievedMemory from "./blocks/retrieved-memory.md";
import workspaceSnapshot from "./blocks/workspace-snapshot.md";
import toneNeutral from "./blocks/tone-neutral.md";
import toneProtective from "./blocks/tone-protective.md";

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
