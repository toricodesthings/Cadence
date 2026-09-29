import type { Config } from "@react-router/dev/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export default {
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  // Precache the whole web app so any screen opens offline, not only ones visited
  // before: list every build asset into sw.js (its bytes change per build, which
  // is also how browsers notice an update). The desktop app has no service worker.
  async buildEnd({ reactRouterConfig, viteConfig }) {
    if (viteConfig.mode === "desktop") return;
    const client = path.join(reactRouterConfig.buildDirectory, "client");
    const assets = (await readdir(path.join(client, "assets"))).filter((name) => !name.startsWith("desktop"));
    const worker = path.join(client, "sw.js");
    const source = await readFile(worker, "utf8");
    const marker = "/*__PRECACHE__*/[]";
    if (!source.includes(marker)) throw new Error("sw.js is missing the precache marker");
    await writeFile(worker, source.replace(marker, JSON.stringify(assets.map((name) => `/assets/${name}`))));
  },
} satisfies Config;
