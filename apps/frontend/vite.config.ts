import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { readReleaseInfo } from "./release-info.ts";

const release = readReleaseInfo(new URL("../../", import.meta.url));
// Unique per build, so every deploy (not only releases) tells open tabs to reload.
const buildId = Date.now().toString(36);

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    ...(mode === "test" ? [] : [reactRouter()]),
    {
      name: "cadence-build-id",
      apply: "build",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ buildId }) });
      },
    },
  ],
  // Version + in-app changelog come from the root package.json / CHANGELOG.md (see release-info.ts).
  define: {
    __CADENCE_PUBLIC_VERSION__: JSON.stringify(release.version),
    __CADENCE_VERSION__: JSON.stringify(release.semver),
    __CADENCE_CHANGELOG__: JSON.stringify(release.changelog),
    __CADENCE_BUILD_ID__: JSON.stringify(buildId),
  },
  // Dev cold-start stability. Heavy deps below are imported inside lazy route
  // modules, so Vite would otherwise discover them only on first navigation —
  // triggering a mid-session optimize re-bundle that 504s in-flight requests
  // ("Outdated Optimize Dep") and forces a full reload. Pre-bundling them at
  // boot makes the optimize pass happen once, before the browser connects.
  // Vite 8 resolves tsconfig `paths` natively (replaced vite-tsconfig-paths).
  resolve: {
    tsconfigPaths: true,
    // @neondatabase/auth needs four error classes from the Supabase client, not the client.
    alias: { "@supabase/auth-js": fileURLToPath(new URL("./app/lib/auth/supabase-auth-errors.ts", import.meta.url)) },
  },
  optimizeDeps: {
    include: [
      "emoji-mart",
      "@emoji-mart/react",
      "ai",
      "@ai-sdk/react",
      "framer-motion",
      "react-markdown",
      "remark-gfm",
      "date-fns",
      "lucide-react",
      "sonner",
      "zustand",
    ],
  },
  // Warm the route entrypoints at startup so their static imports are
  // transformed (and their deps discovered) up front rather than lazily.
  // Stable vendors every first screen loads, as a few long-cached files instead of dozens of
  // small chunks (each one a separate service worker lookup). Only libraries whose whole
  // module set is on the first screen belong here, or a group would drag lazy code forward.
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: "vendor-react", test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:react|react-dom|react-router|scheduler|cookie|set-cookie-parser)[\\/]/ },
            { name: "vendor-query", test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?@tanstack[\\/]/ },
            { name: "vendor-motion", test: /node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:framer-motion|motion-dom|motion-utils)[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    warmup: {
      clientFiles: [
        "./app/entry.client.tsx",
        "./app/root.tsx",
        "./app/routes/**/*.tsx",
      ],
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    // Several suites call vi.resetModules() and re-import a module graph (hono/client,
    // outbox) per test; under full-suite parallel load that import alone can exceed the
    // 5s default and flake. The assertions themselves are instant.
    testTimeout: 15_000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
}));
