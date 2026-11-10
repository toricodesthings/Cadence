// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hardenCsp, inlineScriptHashes } from "../build-csp";

const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
const html = `<script>a()</script><script src="/x.js"></script><script type="module" async="">import "/m.js";</script>`;
const policy = (out: string) => /Content-Security-Policy: (.*)/.exec(out)![1];
const directive = (out: string, name: string) => policy(out).split("; ").find((d) => d.startsWith(`${name} `))!;

describe("deployed CSP", () => {
    it("names each inline script by hash instead of allowing any inline script", () => {
        const out = hardenCsp(headers, html);
        const scriptSrc = directive(out, "script-src");
        expect(scriptSrc).not.toContain("'unsafe-inline'");
        expect(inlineScriptHashes(html)).toHaveLength(2);
        for (const hash of inlineScriptHashes(html)) expect(scriptSrc).toContain(hash);
    });

    it("drops dev-only connect sources and narrows images", () => {
        const out = hardenCsp(headers, html);
        expect(directive(out, "connect-src")).not.toMatch(/localhost|ep-green-forest/);
        expect(directive(out, "connect-src")).toContain("'self'");
        expect(directive(out, "img-src")).not.toMatch(/ https:( |$)/);
    });

    it("refuses headers without exactly one policy", () => {
        expect(() => hardenCsp("/*\n  X-Frame-Options: DENY\n", html)).toThrow();
    });
});
