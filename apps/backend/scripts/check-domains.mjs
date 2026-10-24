// Domain-boundary guard (AGENTS.md). One domain may import another only through its
// `*.service.ts` or a module listed in PUBLIC; anything else is a reach into internals.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";

const ROOT = "src/domains";
/** Non-service modules other domains may use, as `<domain>/<file>`. Keep it short. */
const PUBLIC = [
    "ai/tools/", // the MCP server and debug scenarios publish the assistant's tools
    "ai/turn",
    "decisions/effort-guess",
    "decisions/placement",
    "decisions/did-you-mean",
    "mcp/oauth",
    "push/reminder-clock", // writes elsewhere (chat, MCP, account deletion) ask the person's reminder clock to rebuild or forget
    "settings/settings.route",
    "settings/background-image",
    "tasks/task-nlp",
];

const violations = [];
for (const file of readdirSync(ROOT, { recursive: true })) {
    if (!/\.tsx?$/.test(file)) continue;
    const from = file.split("/")[0];
    for (const [, spec] of readFileSync(join(ROOT, file), "utf8").matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
        const target = relative(ROOT, resolve(dirname(join(ROOT, file)), spec));
        const domain = target.split("/")[0];
        if (target.startsWith("..") || domain === from) continue;
        if (target.endsWith(".service") || PUBLIC.some((p) => target === p || (p.endsWith("/") && target.startsWith(p)))) continue;
        violations.push(`${ROOT}/${file}: reaches into "${target}" (import ${domain}'s service instead)`);
    }
}

if (violations.length > 0) {
    console.error(`Domain-boundary violations:\n${violations.join("\n")}`);
    process.exit(1);
}
console.log("backend domain boundaries OK");
