// Dependency-rule guard: @cadence/nlp is the bottom of the package graph. It may
// import only its own libraries — no other @cadence package, framework, or app.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const FORBIDDEN = [
    "drizzle-orm",
    "hono",
    "react",
    "@cloudflare/workers-types",
    "@cadence/backend",
    "@cadence/frontend",
    "@cadence/contracts",
    "@cadence/domain",
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
        const src = readFileSync(full, "utf8");
        for (const m of src.matchAll(importRe)) {
            const spec = m[1];
            if (
                FORBIDDEN.some((f) => spec === f || spec.startsWith(`${f}/`)) ||
                spec.includes("apps/")
            ) {
                violations.push(`${full}: forbidden import "${spec}"`);
            }
        }
    }
}

walk(root);

if (violations.length > 0) {
    console.error("@cadence/nlp dependency-rule violations:\n" + violations.join("\n"));
    process.exit(1);
}
console.log("@cadence/nlp import boundaries OK");
