import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export const shared = {
    plugins: [
        {
            name: "md-text",
            transform: (code: string, id: string) =>
                id.endsWith(".md") ? `export default ${JSON.stringify(code)};` : undefined,
        },
    ],
    resolve: {
        alias: {
            "cloudflare:workers": fileURLToPath(new URL("./tests/helpers/cloudflare-workers.ts", import.meta.url).href),
        },
    },
    test: {
        environment: "node" as const,
        restoreMocks: true,
        server: {
            deps: {
                inline: ["@cloudflare/workers-oauth-provider", "@cloudflare/codemode", "partyserver", "y-partyserver"],
            },
        },
    },
};

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
