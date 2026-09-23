import { describe, expect, it } from "vitest";
import { HELP_TOPICS, helpTools } from "../../src/domains/ai/tools/help";
import { PROMPT_BLOCKS } from "../../src/domains/ai/prompt/prompt-blocks";

// Mirrors the frontend's routes.ts and SettingsContent TabId; a link outside these is a dead end.
const ROUTES = ["/", "/today", "/schedule", "/events", "/upcoming", "/completed", "/trash", "/routines", "/weekly-review", "/help-feedback", "/changelog"];
const SETTINGS_TABS = ["menu", "about", "account", "appearance", "notifications", "datetime", "tasks", "shortcuts", "assistant", "integrations", "ai", "location", "privacy"];

const links = (text: string) => [...text.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]!);

describe("get_cadence_help", () => {
    it("returns the topic's text", async () => {
        const tool = helpTools().get_cadence_help;
        const out = await tool.execute!({ topic: "repeats" }, { toolCallId: "t", messages: [], context: undefined } as never);
        expect(out).toEqual({ topic: "repeats", text: HELP_TOPICS.repeats });
    });

    it("links only to real in-app places (guide + primer)", () => {
        const all = [...Object.values(HELP_TOPICS), PROMPT_BLOCKS.base.join("\n")].flatMap(links);
        expect(all.length).toBeGreaterThan(20);
        for (const href of all) {
            if (href.startsWith("?settings=")) expect(SETTINGS_TABS).toContain(href.slice("?settings=".length));
            else expect(ROUTES).toContain(href.split("?")[0]);
        }
    });
});
