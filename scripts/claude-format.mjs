// Claude Code hooks: `track` (PostToolUse) records each edited path; `flush` (Stop) formats them once with oxfmt.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, extname, relative, resolve, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const list = resolve(root, "node_modules/.cache/claude-format.txt");
const exts = new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".json",
    ".jsonc",
    ".json5",
    ".css",
    ".scss",
    ".less",
    ".html",
    ".vue",
    ".yaml",
    ".yml",
    ".toml",
    ".graphql",
]);

const inside = (p) => {
    const rel = relative(root, p);
    return rel && !rel.startsWith("..") && !isAbsolute(rel);
};

if (process.argv[2] === "track") {
    const input = JSON.parse(readFileSync(0, "utf8") || "{}");
    const file = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
    if (file && inside(resolve(file)) && exts.has(extname(file))) {
        mkdirSync(dirname(list), { recursive: true });
        appendFileSync(list, resolve(file) + "\n");
    }
} else if (process.argv[2] === "flush" && existsSync(list)) {
    const files = [...new Set(readFileSync(list, "utf8").split("\n"))].filter((f) => f && existsSync(f));
    rmSync(list);
    if (files.length) {
        spawnSync(resolve(root, "node_modules/.bin/oxfmt"), ["--no-error-on-unmatched-pattern", ...files], {
            cwd: root,
            stdio: "ignore",
        });
    }
}
