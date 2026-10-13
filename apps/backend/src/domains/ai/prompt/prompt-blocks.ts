/**
 * The assistant's system prompt, as markdown files in src/prompts/assistant: base/ (static,
 * identical for every user and turn), voice/ (one per persona + the high-workload
 * modifier), user/ (per-user and per-turn templates). Git is the only source of
 * truth: edit a file and push — the deploy ships it. The composer interpolates
 * {{placeholders}}; an unknown one throws (caught by the tests).
 *
 * Base order is load-bearing (authority, then cacheable prefix): identity, rules,
 * changes, reading intent, using tools, recipes, replies, Cadence primer.
 */
import type { PromptBlocks } from "./prompt-blocks.schema";
import identity from "../../../prompts/assistant/base/identity.md";
import rules from "../../../prompts/assistant/base/rules.md";
import changes from "../../../prompts/assistant/base/changes.md";
import readingIntent from "../../../prompts/assistant/base/reading-intent.md";
import usingTools from "../../../prompts/assistant/base/using-tools.md";
import recipes from "../../../prompts/assistant/base/recipes.md";
import replies from "../../../prompts/assistant/base/replies.md";
import cadencePrimer from "../../../prompts/assistant/base/cadence-primer.md";
import secretary from "../../../prompts/assistant/voice/secretary.md";
import coach from "../../../prompts/assistant/voice/coach.md";
import minimalist from "../../../prompts/assistant/voice/minimalist.md";
import companion from "../../../prompts/assistant/voice/companion.md";
import workloadHigh from "../../../prompts/assistant/voice/workload-high.md";
import customInstructions from "../../../prompts/assistant/user/custom-instructions.md";
import environment from "../../../prompts/assistant/user/environment.md";
import memory from "../../../prompts/assistant/user/memory.md";
import memoryFacts from "../../../prompts/assistant/user/memory-facts.md";
import memoryFact from "../../../prompts/assistant/user/memory-fact.md";
import memoryOff from "../../../prompts/assistant/user/memory-off.md";
import snapshot from "../../../prompts/assistant/user/snapshot.md";

const t = (text: string) => text.trimEnd();

export const PROMPT_BLOCKS: PromptBlocks = {
    base: [identity, rules, changes, readingIntent, usingTools, recipes, replies, cadencePrimer].map(t),
    voices: { secretary: t(secretary), coach: t(coach), minimalist: t(minimalist), companion: t(companion) },
    workloadHigh: t(workloadHigh),
    customInstructions: t(customInstructions),
    environment: t(environment),
    snapshot: t(snapshot),
    memory: t(memory),
    memoryFacts: t(memoryFacts),
    memoryFact: t(memoryFact),
    memoryOff: t(memoryOff),
};
