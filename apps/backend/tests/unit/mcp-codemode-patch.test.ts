import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { setSearchRanker } from "@cloudflare/codemode";

const source = readFileSync(createRequire(import.meta.url).resolve("@cloudflare/codemode"), "utf8");
const region = source.slice(
    source.indexOf("//#region src/connectors/search.ts"),
    source.indexOf("//#region src/connectors/describe.ts"),
);

describe("@cloudflare/codemode search patch", () => {
    it("exports the ranker hook", () => {
        expect(typeof setSearchRanker).toBe("function");
    });

    it("calls the hook inside searchConnectors, and falls back when it throws or declines", () => {
        expect(region).toContain("searchRanker(query, items)");
        expect(region).toContain("catch (err)");
        expect(region).toContain("if (custom) return");
    });
});
