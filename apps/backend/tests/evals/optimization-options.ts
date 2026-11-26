import {
    CACHE_VARIANTS,
    DEFAULT_CACHE_VARIANT,
    type AgentBuildOptions,
    type CacheVariant,
} from "../../src/domains/ai/agent";

export function optimizationOptions(vars: Record<string, string | undefined>): Pick<AgentBuildOptions, "cacheVariant"> {
    const ttl = vars.AI_EVAL_CACHE_VARIANT ?? DEFAULT_CACHE_VARIANT;
    if (!CACHE_VARIANTS.includes(ttl as CacheVariant)) throw new Error("Invalid AI_EVAL_CACHE_VARIANT");
    return { cacheVariant: ttl as CacheVariant };
}
