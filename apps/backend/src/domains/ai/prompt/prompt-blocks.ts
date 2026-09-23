/**
 * The assistant's system prompt, as markdown files in ./blocks: base/ (static,
 * identical for every user and turn), voice/ (one per persona + the high-workload
 * modifier), user/ (per-user and per-turn templates). Git is the only source of
 * truth: edit a file and push — the deploy ships it. The composer interpolates
 * {{placeholders}}; an unknown one throws (caught by the tests).
 *
 * Base order is load-bearing (authority, then cacheable prefix): identity, rules,
 * changes, reading intent, using tools, replies, Cadence primer.
 */
import type { PromptBlocks } from "./prompt-blocks.schema";
import identity from "./blocks/base/identity.md";
import rules from "./blocks/base/rules.md";
import changes from "./blocks/base/changes.md";
import readingIntent from "./blocks/base/reading-intent.md";
import usingTools from "./blocks/base/using-tools.md";
import replies from "./blocks/base/replies.md";
import cadencePrimer from "./blocks/base/cadence-primer.md";
import secretary from "./blocks/voice/secretary.md";
import coach from "./blocks/voice/coach.md";
import minimalist from "./blocks/voice/minimalist.md";
import companion from "./blocks/voice/companion.md";
import workloadHigh from "./blocks/voice/workload-high.md";
import customInstructions from "./blocks/user/custom-instructions.md";
import environment from "./blocks/user/environment.md";
import memory from "./blocks/user/memory.md";

const t = (text: string) => text.trimEnd();

export const PROMPT_BLOCKS: PromptBlocks = {
    base: [identity, rules, changes, readingIntent, usingTools, replies, cadencePrimer].map(t),
    voices: { secretary: t(secretary), coach: t(coach), minimalist: t(minimalist), companion: t(companion) },
    workloadHigh: t(workloadHigh),
    customInstructions: t(customInstructions),
    environment: t(environment),
    memory: t(memory),
};
