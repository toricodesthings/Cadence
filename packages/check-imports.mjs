// Dependency-rule guard for every shared package (packages/AGENTS.md §6). Run from a
// package dir as `node ../check-imports.mjs [extra forbidden specifiers…]`. No package
// may import an app, backend platform code, Drizzle, Hono, React, or workers-types;
// each package passes the @cadence packages above it in the graph as extras.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const pkg = JSON.parse(readFileSync("package.json", "utf8")).name;
const FORBIDDEN = [
    "drizzle-orm",
    "hono",
    "react",
    "@cloudflare/workers-types",
    "@cadence/backend",
    "@cadence/frontend",
    ...process.argv.slice(2),
];

const importRe = /\bfrom\s+["']([^"']+)["']/g;
const violations = [];

function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            walk(full);
            continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        for (const [, spec] of readFileSync(full, "utf8").matchAll(importRe)) {
            if (
                FORBIDDEN.some((f) => spec === f || spec.startsWith(`${f}/`)) ||
                spec.includes("apps/") ||
                spec.includes("platform/")
            ) {
                violations.push(`${full}: forbidden import "${spec}"`);
            }
        }
    }
}

walk("src");

if (violations.length > 0) {
    console.error(`${pkg} dependency-rule violations:\n${violations.join("\n")}`);
    process.exit(1);
}
console.log(`${pkg} import boundaries OK`);
