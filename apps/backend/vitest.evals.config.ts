import { defineConfig } from "vitest/config";
import base from "./vitest.config";

/** `pnpm eval:assistant`: live-model evals, kept out of `pnpm test` (they spend tokens). */
export default defineConfig({
    ...base,
    test: {
        ...base.test,
        include: ["tests/evals/**/*.eval.ts"],
        testTimeout: 240_000,
        hookTimeout: 60_000,
        maxConcurrency: 5,
    },
});
