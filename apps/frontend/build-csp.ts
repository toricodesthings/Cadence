import { createHash } from "node:crypto";

/** Dev-only sources that must never reach the deployed policy (the deployed app talks to its own origin). */
const DEV_CONNECT_SOURCES = ["http://localhost:8787", "ws://localhost:8787", "https://ep-green-forest-aeushytt.neonauth.c-2.us-east-2.aws.neon.tech"];
/** Images: the app's own files, uploads and previews (data:, blob:), and Google/GitHub sign-in avatars. */
const IMG_SRC = "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com";

/** The SHA-256 CSP source of every inline `<script>` in the SPA shell. */
export function inlineScriptHashes(html: string): string[] {
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(([, body]) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
}

/**
 * The deployed `_headers` with a script policy that names each inline script by hash instead of `'unsafe-inline'`,
 * images narrowed to the hosts actually used, and no dev-only connect sources. SPA mode serves one static
 * `index.html` for every path, so its scripts (and hashes) are fixed per build.
 */
export function hardenCsp(headers: string, html: string): string {
    const hashes = [...new Set(inlineScriptHashes(html))];
    let replaced = 0;
    const out = headers.replace(/Content-Security-Policy: (.*)/, (_, policy: string) => {
        replaced++;
        return `Content-Security-Policy: ${policy
            .split(/;\s*/)
            .map((directive) => {
                const [name, ...sources] = directive.split(/\s+/);
                if (name === "script-src") return ["script-src", ...sources.filter((s) => s !== "'unsafe-inline'"), ...hashes].join(" ");
                if (name === "img-src") return IMG_SRC;
                if (name === "connect-src") return ["connect-src", ...sources.filter((s) => !DEV_CONNECT_SOURCES.includes(s))].join(" ");
                return directive;
            })
            .join("; ")}`;
    });
    if (replaced !== 1) throw new Error("_headers must hold exactly one Content-Security-Policy line");
    return out;
}
