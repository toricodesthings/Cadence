import { describe, expect, it } from "vitest";
import { rankMethods } from "@cadence/search/methods";

const docs = [
    { id: "get_tasks", name: "get tasks", text: "The user's tasks, filtered by due window or state." },
    { id: "create_sections", name: "create sections", text: "Adds columns to a list, such as This week." },
    { id: "update_habit", name: "update habit", text: "Changes a habit." },
    { id: "reschedule_tasks", name: "reschedule tasks", text: "Moves tasks to another day." },
    { id: "log_habit", name: "log habit", text: "Marks a habit done." },
    { id: "log_notes", name: "log notes", text: "Writes a habit note." },
];
const first = (query: string, options?: Parameters<typeof rankMethods>[2]) =>
    rankMethods(query, docs, options)?.[0]?.id;

describe("rankMethods", () => {
    it("ignores stopwords", () => {
        expect(first("the tasks due this week")).toBe("get_tasks");
    });

    it("matches word forms", () => {
        expect(first("habits")).toBeDefined();
        expect(rankMethods("task", docs)?.map((h) => h.id)).toContain("get_tasks");
    });

    it("lets a name beat a description", () => {
        expect(first("sections")).toBe("create_sections");
        expect(first("week")).toBeDefined();
    });

    it("gives a full name match a bonus", () => {
        expect(first("log habit")).toBe("log_habit");
        expect(first("reschedule a task")).toBe("reschedule_tasks");
    });

    it("expands synonyms from the code word only", () => {
        const synonyms = { reschedule: ["postpone"], habit: ["routine"] };
        expect(first("postpone", { synonyms })).toBe("reschedule_tasks");
        expect(first("routine", { synonyms })).toMatch(/habit/);
        expect(rankMethods("reschedule", docs, { synonyms })?.[0].id).toBe("reschedule_tasks");
        expect(rankMethods("postpone", docs)).toEqual([]);
    });

    it("returns null when only stopwords are left", () => {
        expect(rankMethods("what is the", docs)).toBeNull();
        expect(rankMethods("   ", docs)).toBeNull();
    });

    it("finds a half-typed last word", () => {
        expect(first("resched")).toBe("reschedule_tasks");
    });
});
