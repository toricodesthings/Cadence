import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    ...(mode === "test" ? [] : [reactRouter()]),
  ],
  // Dev cold-start stability. Heavy deps below are imported inside lazy route
  // modules, so Vite would otherwise discover them only on first navigation —
  // triggering a mid-session optimize re-bundle that 504s in-flight requests
  // ("Outdated Optimize Dep") and forces a full reload. Pre-bundling them at
  // boot makes the optimize pass happen once, before the browser connects.
  // Vite 8 resolves tsconfig `paths` natively (replaced vite-tsconfig-paths).
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    include: [
      "emoji-mart",
      "@emoji-mart/react",
      "ai",
      "@ai-sdk/react",
      "framer-motion",
      "react-markdown",
      "remark-gfm",
      "rrule",
      "fuse.js",
      "date-fns",
      "lucide-react",
      "sonner",
      "zustand",
    ],
  },
  // Warm the route entrypoints at startup so their static imports are
  // transformed (and their deps discovered) up front rather than lazily.
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
