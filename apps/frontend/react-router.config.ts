import type { Config } from "@react-router/dev/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { hardenCsp } from "./build-csp";

export default {
    ssr: false,
    async buildEnd({ reactRouterConfig, viteConfig }) {
        if (viteConfig.mode === "desktop") return;
        const client = path.join(reactRouterConfig.buildDirectory, "client");
        const assets = (await readdir(path.join(client, "assets"))).filter((name) =>
            /-[\w-]{8,}\.(js|css|woff2|png|ico|svg|webp)$/.test(name),
        );
        const priority = new Set<string>();
        const visit = async (name: string) => {
            if (priority.has(name) || !assets.includes(name)) return;
            priority.add(name);
            if (!name.endsWith(".js")) return;
            const source = await readFile(path.join(client, "assets", name), "utf8");
            for (const match of source.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+\.js)["']/g))
                await visit(match[1]);
        };
        for (const name of assets.filter((name) => /^(entry\.client|root)-/.test(name))) await visit(name);
        const ordered = [...priority, ...assets.filter((name) => !priority.has(name))];
        const worker = path.join(client, "sw.js");
        const source = await readFile(worker, "utf8");
        const marker = "/*__PRECACHE__*/ []";
        if (!source.includes(marker)) throw new Error("sw.js is missing the precache marker");
        await writeFile(worker, source.replace(marker, JSON.stringify(ordered.map((name) => `/assets/${name}`))));
        const headersFile = path.join(client, "_headers");
        await writeFile(
            headersFile,
            hardenCsp(await readFile(headersFile, "utf8"), await readFile(path.join(client, "index.html"), "utf8")),
        );
    },
} satisfies Config;
