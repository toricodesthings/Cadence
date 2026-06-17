// Dependency-rule guard (Canonical_models §5.4): @cadence/domain may import ONLY
// `rrule`, `date-fns`, `@cadence/contracts`, `@cadence/nlp`. No platform code
// (AppError/db/withRls), no React, no Hono, no apps.
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
                spec.includes("apps/") ||
                spec.includes("platform/")
            ) {
                violations.push(`${full}: forbidden import "${spec}"`);
            }
        }
    }
}

walk(root);

if (violations.length > 0) {
    console.error("@cadence/domain dependency-rule violations:\n" + violations.join("\n"));
    process.exit(1);
}
console.log("@cadence/domain import boundaries OK");
