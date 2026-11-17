// Lint rules for every shared package (packages/AGENTS.md). Packages stay pure and platform-neutral:
// no I/O, no browser or Node globals, no hidden clock or randomness, no console, sub-path imports only.
// Each may import only the @cadence packages below it in `layers`, never an app, backend platform code,
// Drizzle, Hono, React or workers-types, and never a catch-all helpers/utils/misc module.
const forbidden = [
    "drizzle-orm",
    "hono",
    "react",
    "@cloudflare/workers-types",
    "@cadence/backend",
    "@cadence/frontend",
];
const layers: [string, string[]][] = [
    ["domain", []],
    ["geometry", ["@cadence"]],
    ["contracts", ["@cadence/domain"]],
    ["nlp", ["@cadence/contracts", "@cadence/domain"]],
    ["search", ["@cadence/domain", "@cadence/contracts", "@cadence/nlp"]],
];

const pure = "Packages are pure: take it as an argument instead.";
const globals = [
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "window",
    "document",
    "navigator",
    "process",
];

export default {
    plugins: ["eslint", "typescript", "unicorn", "oxc"],
    categories: { correctness: "warn" },
    // Declared so no-restricted-globals can see (and ban) browser and Node globals.
    env: { browser: true, node: true },
    rules: {
        "eslint/no-console": "error",
        "eslint/no-restricted-globals": ["error", ...globals.map((name) => ({ name, message: pure }))],
        "eslint/no-restricted-properties": [
            "error",
            { object: "Date", property: "now", message: pure },
            { object: "Math", property: "random", message: pure },
        ],
    },
    overrides: layers.map(([name, extra]) => ({
        files: [`${name}/src/**/*.{ts,tsx}`],
        rules: {
            "eslint/no-restricted-imports": [
                "error",
                {
                    patterns: [
                        {
                            regex: `^(?:${[...forbidden, ...extra].join("|")})(?:/|$)|apps/|platform/`,
                            message: "Not allowed in this package's layer.",
                        },
                        {
                            regex: "(?:^|/)(?:helpers|utils|misc)$",
                            message: "No catch-all modules; name it by what it does.",
                        },
                        {
                            regex: "^@cadence/(?:contracts|domain)$",
                            message: "Import by sub-path, e.g. @cadence/contracts/task.",
                        },
                    ],
                },
            ],
        },
    })),
};
