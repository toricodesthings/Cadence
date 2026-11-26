import { defineConfig } from "vitest/config";
import { shared } from "./vitest.config";

export default defineConfig({
    ...shared,
    test: {
        ...shared.test,
        include: ["tests/evals/**/*.eval.ts"],
        globalSetup: ["tests/helpers/global-setup.ts"],
        testTimeout: 240_000,
        hookTimeout: 60_000,
        maxConcurrency: 5,
    },
});
