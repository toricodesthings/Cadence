// The time-model guard (root AGENTS.md "Time"). Fails on code that can read a calendar day as a different day.
// Scans apps/*/app, apps/*/src and packages/*/src (not tests), except packages/domain/src/time.ts.
// A deliberate exception needs `// time-ok: <reason>` on the same line; each one is a review question.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ROOTS = ["apps", "packages"].flatMap((top) =>
    readdirSync(join(root, top)).flatMap((name) => ["app", "src"].map((sub) => join(root, top, name, sub)).filter(existsSync)),
);
const EXEMPT = new Set(["packages/domain/src/time.ts"]);

const DATEISH = String.raw`(?:[Dd]ate|[Dd]ay|[Ss]tart|[Ee]nd|[Ss]tamp|[Tt]ime|iso|Iso|ISO|At|due|Due|until|Until|anchor|Anchor)\w*`;
const RULES = [
    [new RegExp(String.raw`\b${DATEISH}\??\.(?:slice|substring)\(\s*0\s*,\s*10\s*\)`), "slicing a timestamp for a day (use dayOf / the LocalDate itself)"],
    [new RegExp(String.raw`\b${DATEISH}\??\.split\(\s*["']T["']\s*\)\s*\[\s*0\s*\]`), "split('T')[0] to get a day"],
    [/toISOString\(\)\s*\.(?:slice|substring|split)\(/, "toISOString() to get a day"],
    [/new Date\(\s*[`"'][^`"']*T(?:00:00|12:00|23:59)/, "new Date(...T00:00) style parsing"],
    [/getTimezoneOffset/, "getTimezoneOffset"],
    [/\.(?:getDate|getHours|setHours|getDay)\(/, "Date local getters/setters in day logic"],
    [/AT TIME ZONE 'UTC'/i, "AT TIME ZONE 'UTC'"],
    [/flexibleDateTimeSchema/, "date-or-datetime union field"],
];

const problems = [];
const SKIP_DIRS = /(^|[\\/])(node_modules|build|\.react-router)([\\/]|$)/;
for (const dir of ROOTS) {
    for (const entry of readdirSync(dir, { recursive: true })) {
        if (SKIP_DIRS.test(entry) || !/\.(ts|tsx|mjs)$/.test(entry) || /\.d\.ts$/.test(entry)) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) continue;
        const rel = relative(root, full);
        if (EXEMPT.has(rel)) continue;
        readFileSync(full, "utf8").split("\n").forEach((line, i) => {
            if (line.includes("time-ok") || line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return;
            for (const [re, why] of RULES) if (re.test(line)) problems.push(`${rel}:${i + 1}  ${why}\n    ${line.trim()}`);
        });
    }
}

if (problems.length) {
    console.error(`check-time: ${problems.length} problem(s). Use @cadence/domain/time, or add \`// time-ok: <reason>\`.\n`);
    console.error(problems.join("\n"));
    process.exit(1);
}
console.log("check-time: ok");
