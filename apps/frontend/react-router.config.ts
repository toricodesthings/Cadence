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
    const assets = (await readdir(path.join(client, "assets"))).filter((name) => /-[\w-]{8,}\.(js|css|woff2|png|ico|svg|webp)$/.test(name));
    // Cache the entry's static dependency closure first; all deferred features follow.
    const priority = new Set<string>();
    const visit = async (name: string) => {
      if (priority.has(name) || !assets.includes(name)) return;
      priority.add(name);
      if (!name.endsWith(".js")) return;
      const source = await readFile(path.join(client, "assets", name), "utf8");
      for (const match of source.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+\.js)["']/g)) await visit(match[1]);
    };
    for (const name of assets.filter((name) => /^(entry\.client|root)-/.test(name))) await visit(name);
    const ordered = [...priority, ...assets.filter((name) => !priority.has(name))];
    const worker = path.join(client, "sw.js");
    const source = await readFile(worker, "utf8");
    const marker = "/*__PRECACHE__*/[]";
    if (!source.includes(marker)) throw new Error("sw.js is missing the precache marker");
    await writeFile(worker, source.replace(marker, JSON.stringify(ordered.map((name) => `/assets/${name}`))));
  },
} satisfies Config;
