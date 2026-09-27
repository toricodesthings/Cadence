import { describe, expect, it } from "vitest";
import { filterSlashCommands, matchSlashCommand } from "../../../../app/lib/ai/slash-commands";

describe("matchSlashCommand", () => {
    it("matches an exact command, any case, with surrounding space", () => {
        expect(matchSlashCommand("/usage")?.id).toBe("usage");
        expect(matchSlashCommand("  /Settings ")?.id).toBe("settings");
    });

    it("lets anything else through as a message", () => {
        expect(matchSlashCommand("/foo")).toBeNull();
        expect(matchSlashCommand("/usage please")).toBeNull();
        expect(matchSlashCommand("usage")).toBeNull();
    });
});

describe("filterSlashCommands", () => {
    it("lists every command for a bare slash and narrows by prefix", () => {
        expect(filterSlashCommands("/").map((c) => c.id)).toEqual(["usage", "clear", "history", "settings"]);
        expect(filterSlashCommands("/U").map((c) => c.id)).toEqual(["usage"]);
        expect(filterSlashCommands("/h").map((c) => c.id)).toEqual(["history"]);
    });

    it("stays closed once the text is not a single /word", () => {
        expect(filterSlashCommands("")).toEqual([]);
        expect(filterSlashCommands("hi /usage")).toEqual([]);
        expect(filterSlashCommands("/usage now")).toEqual([]);
        expect(filterSlashCommands("/zzz")).toEqual([]);
    });
});
