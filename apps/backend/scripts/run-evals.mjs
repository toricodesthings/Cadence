import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const [preset = "smoke", ...args] = process.argv.slice(2);
const suites = {
    smoke: ["assistant"],
    assistant: ["assistant"],
    memory: ["memory"],
    decisions: ["decisions"],
    full: ["assistant", "memory", "decisions"],
    embeddings: ["memory"],
};
if (!Object.hasOwn(suites, preset)) throw new Error(`Unknown evaluation preset: ${preset}`);
const profile = preset === "full" ? "full" : preset === "smoke" ? "smoke" : "iteration";
// --list collects tests without running paid callbacks or hooks.
const list = args.includes("--list");
const filters = args.filter((arg) => arg !== "--list");
const child = spawn(process.execPath, [
    fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
    ...(list ? ["list", "--staticParse=false"] : ["run"]), "--config", "vitest.evals.config.ts",
    ...suites[preset].map((suite) => `tests/evals/${suite}.eval.ts`),
    ...(preset === "embeddings" ? ["-t", "embedding size"] : []),
    ...filters,
], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    stdio: "inherit",
    env: { ...process.env, AI_EVAL_PROFILE: profile, AI_EVAL_EMBEDDING_DIMENSIONS: String(preset === "embeddings") },
});
child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
