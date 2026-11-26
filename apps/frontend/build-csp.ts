import { createHash } from "node:crypto";

const DEV_CONNECT_SOURCES = [
    "http://localhost:8787",
    "ws://localhost:8787",
    "https://ep-proud-hall-bdjzqcpe.neonauth.c-8.us-east-2.aws.neon.tech",
];
const IMG_SRC = "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com";

export function inlineScriptHashes(html: string): string[] {
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
        ([, body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`,
    );
}

export function hardenCsp(headers: string, html: string): string {
    const hashes = [...new Set(inlineScriptHashes(html))];
    let replaced = 0;
    const out = headers.replace(/Content-Security-Policy: (.*)/, (_, policy: string) => {
        replaced++;
        return `Content-Security-Policy: ${policy
            .split(/;\s*/)
            .map((directive) => {
                const [name, ...sources] = directive.split(/\s+/);
                if (name === "script-src")
                    return ["script-src", ...sources.filter((s) => s !== "'unsafe-inline'"), ...hashes].join(" ");
                if (name === "img-src") return IMG_SRC;
                if (name === "connect-src")
                    return ["connect-src", ...sources.filter((s) => !DEV_CONNECT_SOURCES.includes(s))].join(" ");
                return directive;
            })
            .join("; ")}`;
    });
    if (replaced !== 1) throw new Error("_headers must hold exactly one Content-Security-Policy line");
    return out;
}
