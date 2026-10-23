// Dependency boundaries for every shared package (packages/AGENTS.md §6). No package may
// import an app, backend platform code, Drizzle, Hono, React, or workers-types; each may
// import only the @cadence packages below it in `layers`.
const forbidden = ["drizzle-orm", "hono", "react", "@cloudflare/workers-types", "@cadence/backend", "@cadence/frontend"];
const layers: [string, string[]][] = [
    ["domain", []],
    ["geometry", ["@cadence"]],
    ["contracts", ["@cadence/domain"]],
    ["nlp", ["@cadence/contracts", "@cadence/domain"]],
    ["search", ["@cadence/domain", "@cadence/contracts", "@cadence/nlp"]],
];

export default {
    categories: { correctness: "off" },
    overrides: layers.map(([name, extra]) => ({
        files: [`${name}/src/**/*.{ts,tsx}`],
        rules: {
            "eslint/no-restricted-imports": ["error", {
                patterns: [{ regex: `^(?:${[...forbidden, ...extra].join("|")})(?:/|$)|apps/|platform/` }],
            }],
        },
    })),
};
