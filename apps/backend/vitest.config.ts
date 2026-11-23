import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Shared by `pnpm test` (below) and the live-model evals (vitest.evals.config.ts). */
export const shared = {
    // Mirror wrangler's Text rule: prompt markdown imports as its string.
    plugins: [
        {
            name: "md-text",
            transform: (code: string, id: string) =>
                id.endsWith(".md") ? `export default ${JSON.stringify(code)};` : undefined,
        },
    ],
    // Node can't load the Workers runtime module the OAuth provider imports.
    resolve: {
        alias: {
            "cloudflare:workers": fileURLToPath(new URL("./tests/helpers/cloudflare-workers.ts", import.meta.url).href),
        },
    },
    test: {
        environment: "node" as const,
        restoreMocks: true,
        server: { deps: { inline: ["@cloudflare/workers-oauth-provider", "@cloudflare/codemode"] } },
    },
};

/**
 * Two projects so nothing waits on a database it doesn't use:
 * - `fast`: unit + security, pure and mocked. No PGlite, no global setup.
 * - `db`: integration + e2e, real routes on PGlite (global-setup.ts builds the migrated snapshot once).
 * Timeouts are tight on purpose: a stuck promise fails in seconds, with the test named, instead of hanging the run.
 */
export default defineConfig({
    test: {
        teardownTimeout: 5_000,
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts", "src/types/**", "src/db/schema/**", "src/domains/debug/scenarios/**"],
            reporter: ["text-summary", "html", "lcov"],
        },
        projects: [
            {
                ...shared,
                test: {
                    ...shared.test,
                    name: "fast",
                    include: ["tests/unit/**/*.test.ts", "tests/security/**/*.test.ts"],
                    testTimeout: 5_000,
                    hookTimeout: 5_000,
                },
            },
            {
                ...shared,
                test: {
                    ...shared.test,
                    name: "db",
                    include: ["tests/integration/**/*.test.ts", "tests/e2e/**/*.test.ts"],
                    globalSetup: ["tests/helpers/global-setup.ts"],
                    testTimeout: 15_000,
                    hookTimeout: 30_000,
                },
            },
        ],
    },
});
