/** Stored context is reusable only under current consent and with unchanged facts this mode may still read. */
import { PROMPT_BLOCKS } from "../prompt/prompt-blocks";
import { memoryLines, storedTurnContext } from "../prompt/prompt-composer";
import type { MemoryMode } from "@cadence/contracts/memory";
import type { loadContextFacts } from "./memory-store";
import { isLearning } from "./memory-mode";

const MEMORY_FENCE = /<<<CADENCE_DATA_([a-zA-Z0-9]+) kind="memory" trust="untrusted">>>\n([\s\S]*?)\n<<<END_CADENCE_DATA_\1>>>/;
const FACT_ID = /^- (?:\(said [^\n]*\) )?\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gm;

/** Returns replay copies; never edits the persisted historical prefix. Invalid contexts rebuild on continuation. */
export async function validateStoredContexts<M extends { role: string; metadata?: unknown }>(
    history: M[], mode: MemoryMode | null, readFacts: (ids: string[]) => ReturnType<typeof loadContextFacts>,
): Promise<M[]> {
    const memoryOn = isLearning(mode);
    const parsed = history.map((message) => {
        const context = storedTurnContext(message);
        const fence = context?.match(MEMORY_FENCE);
        const ids = fence ? [...fence[2].matchAll(FACT_ID)].map((m) => m[1]) : [];
        return { context, fence, ids };
    });
    const ids = [...new Set(parsed.flatMap((p) => p.ids))];
    const facts = memoryOn && ids.length > 0 && ids.length <= 500 ? await readFacts(ids) : [];
    const byId = new Map(facts.map((fact) => [fact.id, fact]));
    return history.map((message, i) => {
        const { context, fence, ids } = parsed[i];
        if (context === undefined) return message;
        let valid: boolean;
        if (!memoryOn) valid = !fence && (!context.includes("## Memory") || context.endsWith(PROMPT_BLOCKS.memoryOff));
        else if (fence) {
            const current = ids.flatMap((id) => byId.get(id) ?? []);
            valid = ids.length > 0 && current.length === ids.length && memoryLines(PROMPT_BLOCKS, current, fence[1]) === fence[2];
        } else valid = !context.includes("## Memory");
        if (valid) return message;
        const { turnContext: _removed, ...metadata } = message.metadata as Record<string, unknown>;
        return { ...message, metadata };
    });
}
