import { defineConfig } from "vitest/config";

export default defineConfig({
    // Mirror wrangler's Text rule: prompt markdown imports as its string.
    plugins: [{
        name: "md-text",
        transform: (code, id) => (id.endsWith(".md") ? `export default ${JSON.stringify(code)};` : undefined),
    }],
    test: {
        environment: "node",
        setupFiles: ["./tests/setup.ts"],
        include: ["tests/**/*.test.ts"],
    },
});
