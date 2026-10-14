import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Local credentials stay local; exported values take precedence. */
export function evaluationVars(): Record<string, string | undefined> {
    let local: Record<string, string> = {};
    try {
        local = Object.fromEntries(readFileSync(join(__dirname, "../../.dev.vars"), "utf8").split("\n")
            .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/)).filter(Boolean).map((m) => [m![1], m![2]]));
    } catch { /* Exported credentials also work without .dev.vars. */ }
    return { ...local, ...process.env };
}

export function evaluationOptions(vars: Record<string, string | undefined>) {
    const profile = vars.AI_EVAL_PROFILE ?? "iteration";
    if (!["smoke", "iteration", "full"].includes(profile)) throw new Error("Invalid AI_EVAL_PROFILE");
    const runs = (key: string, fullDefault: number) => {
        const raw = vars[key] ?? vars.EVAL_RUNS;
        if (raw !== undefined && (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1)) {
            throw new Error(`Invalid ${key}: expected a positive integer`);
        }
        // The smoke preset always stays small, even with old repeat settings in .dev.vars.
        return profile === "smoke" ? 1 : Number(raw ?? (profile === "full" ? fullDefault : 1));
    };
    return {
        profile,
        assistantRuns: runs("EVAL_RUNS", 3),
        memoryRuns: runs("MEMORY_EVAL_RUNS", 3),
        decisionRuns: runs("DECISIONS_EVAL_RUNS", 2),
        embeddingDimensions: vars.AI_EVAL_EMBEDDING_DIMENSIONS === "true",
    };
}
