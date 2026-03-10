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
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
}));
