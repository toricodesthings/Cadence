import type { AgentBuildOptions, CacheVariant } from "../../src/domains/ai/agent";
import { DEFAULT_PROMPT_PACKAGING } from "../../src/domains/ai/prompt/prompt-blocks.schema";

/** Fixed for the entire evaluation process: every turn of a conversation uses one variant. */
export function optimizationOptions(vars: Record<string, string | undefined>): Pick<AgentBuildOptions, "promptPackaging" | "cacheVariant"> {
    const packaging = vars.AI_EVAL_PROMPT_PACKAGING ?? DEFAULT_PROMPT_PACKAGING;
    const ttl = vars.AI_EVAL_CACHE_VARIANT ?? "5m-5m";
    if (packaging !== "baseline" && packaging !== "static-memory") throw new Error("Invalid AI_EVAL_PROMPT_PACKAGING");
    if (!["5m-5m", "1h-5m", "1h-1h"].includes(ttl)) throw new Error("Invalid AI_EVAL_CACHE_VARIANT");
    return { promptPackaging: packaging, cacheVariant: ttl as CacheVariant };
}
