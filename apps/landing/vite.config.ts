import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
// The one CHANGELOG.md parser, shared with the app so both pages read the file the same way.
import { readReleaseInfo } from "../frontend/release-info.ts";

const release = readReleaseInfo(new URL("../../", import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
  define: { __CADENCE_CHANGELOG__: JSON.stringify(release.changelog) },
});
