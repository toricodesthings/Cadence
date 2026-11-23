import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { TOOL_CATALOG, type ToolName } from "@cadence/contracts/ai-tools";
import { coreTools } from "../../src/domains/ai/tools/index";
import { EXAMPLES } from "../../src/domains/mcp/examples";
import { mcpInputSchema, type PublishedTool } from "../../src/domains/mcp/server";

const tools = coreTools({} as never, "u", {
    timezone: "UTC",
    currentDate: "",
    today: "2026-01-01",
}) as unknown as Record<string, { inputSchema: z.ZodObject }>;
const published = [
    ...(Object.keys(TOOL_CATALOG) as ToolName[]).filter((name) => name !== "ask_user"),
    "get_today",
] as PublishedTool[];

describe("MCP examples", () => {
    it("every published tool has one or two", () => {
        expect(Object.keys(EXAMPLES).sort()).toEqual([...published].sort());
        for (const name of published) expect(EXAMPLES[name].length).toBeGreaterThan(0);
    });

    it.each(published)("%s: each example parses against its MCP input schema", async (name) => {
        const write = name !== "get_today" && TOOL_CATALOG[name as ToolName].kind !== "read";
        const schema = mcpInputSchema(name, tools[name]?.inputSchema, write);
        for (const args of EXAMPLES[name]) {
            const parsed = await schema.safeParseAsync(args);
            expect(parsed.error?.issues ?? []).toEqual([]);
        }
    });
});
