import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { readReleaseInfo } from "./release-info.ts";

const release = readReleaseInfo(new URL("../../", import.meta.url));
const buildId = Date.now().toString(36);

const vendor = (names: string) =>
    new RegExp(String.raw`node_modules[\\/](?:\.pnpm[\\/][^\\/]+[\\/]node_modules[\\/])?(?:${names})[\\/]`);

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
    define: {
        __CADENCE_PUBLIC_VERSION__: JSON.stringify(release.version),
        __CADENCE_VERSION__: JSON.stringify(release.semver),
        __CADENCE_CHANGELOG__: JSON.stringify(release.changelog),
        __CADENCE_BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
        tsconfigPaths: true,
        alias: {
            "@supabase/auth-js": fileURLToPath(new URL("./app/lib/auth/supabase-auth-errors.ts", import.meta.url)),
        },
    },
    ssr: { noExternal: ["rrule"] },
    optimizeDeps: {
        include: [
            "emoji-mart",
            "@emoji-mart/react",
            "ai",
            "@ai-sdk/react",
            "framer-motion",
            "react-markdown",
            "remark-gfm",
            "lucide-react",
            "sonner",
            "zustand",
        ],
    },
    build: {
        rolldownOptions: {
            output: {
                codeSplitting: {
                    groups: [
                        {
                            name: "vendor-react",
                            test: vendor("react|react-dom|react-router|scheduler|cookie|set-cookie-parser"),
                        },
                        { name: "vendor-query", test: vendor("@tanstack") },
                        { name: "vendor-motion", test: vendor("framer-motion|motion-dom|motion-utils") },
                    ],
                },
            },
        },
    },
    server: {
        warmup: {
            clientFiles: ["./app/entry.client.tsx", "./app/root.tsx", "./app/routes/**/*.tsx"],
        },
    },
    test: {
        environment: "jsdom",
        globals: false,
        setupFiles: ["./tests/setup.ts"],
        testTimeout: 15_000,
        include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    },
}));
