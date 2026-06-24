import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    ...(mode === "test" ? [] : [reactRouter()]),
    tsconfigPaths(),
  ],
  // Dev cold-start stability. Heavy deps below are imported inside lazy route
  // modules, so Vite would otherwise discover them only on first navigation —
  // triggering a mid-session optimize re-bundle that 504s in-flight requests
  // ("Outdated Optimize Dep") and forces a full reload. Pre-bundling them at
  // boot makes the optimize pass happen once, before the browser connects.
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
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
}));
