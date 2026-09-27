import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    // Mirror wrangler's Text rule: prompt markdown imports as its string.
    plugins: [{
        name: "md-text",
        transform: (code, id) => (id.endsWith(".md") ? `export default ${JSON.stringify(code)};` : undefined),
    }],
    // Node can't load the Workers runtime module the OAuth provider imports.
    resolve: { alias: { "cloudflare:workers": fileURLToPath(new URL("./tests/helpers/cloudflare-workers.ts", import.meta.url).href) } },
    test: {
        environment: "node",
        restoreMocks: true,
        include: ["tests/**/*.test.ts"],
        server: { deps: { inline: ["@cloudflare/workers-oauth-provider"] } },
    },
});
