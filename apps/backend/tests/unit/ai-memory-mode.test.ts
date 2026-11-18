import { describe, expect, it } from "vitest";
import { isLearning, memoryStateOf, planningOn, resolveMode } from "../../src/domains/ai/memory/memory-mode";
import { textOf } from "../../src/domains/ai/memory/message-text";

describe("memoryStateOf: the stored choice, whatever shape the settings blob is in", () => {
    it("reads a chosen mode, epoch and learning cut-off", () => {
        expect(
            memoryStateOf({
                assistant: { memoryMode: "full", memoryEpoch: 3, memoryLearningNotBefore: "2026-10-17T00:00:00.000Z" },
            }),
        ).toEqual({ stored: "full", mode: "full", epoch: 3, notBefore: "2026-10-17T00:00:00.000Z" });
    });

    it.each([
        ["no settings at all", null],
        ["settings that aren't an object", "oops"],
        ["no assistant block", {}],
        ["an assistant block that is a string", { assistant: "x" }],
    ])("treats %s as not chosen yet: Basic, epoch 0", (_name, settings) => {
        expect(memoryStateOf(settings)).toEqual({ stored: null, mode: "basic", epoch: 0, notBefore: null });
    });

    it.each(["FULL", "on", "", 1, true, {}, []])("never trusts an unknown stored mode %j", (memoryMode) => {
        expect(memoryStateOf({ assistant: { memoryMode } })).toMatchObject({ stored: null, mode: "basic" });
    });

    it.each(["3", null, {}])("falls back to epoch 0 for a non-number epoch %j", (memoryEpoch) => {
        expect(memoryStateOf({ assistant: { memoryMode: "off", memoryEpoch } }).epoch).toBe(0);
    });

    it("keeps Off as Off (a stored choice, not the Basic default)", () => {
        expect(memoryStateOf({ assistant: { memoryMode: "off" } })).toMatchObject({ stored: "off", mode: "off" });
    });
});

describe("what each mode allows", () => {
    it("resolves an unchosen memory to Basic and learns in Basic and Full only", () => {
        expect(resolveMode(null)).toBe("basic");
        expect(resolveMode(undefined)).toBe("basic");
        expect([null, undefined, "basic", "full"].map((m) => isLearning(m as never))).toEqual([true, true, true, true]);
        expect(isLearning("off")).toBe(false);
    });

    it("plans only in Full", () => {
        expect(planningOn({ mode: "full" })).toBe(true);
        expect(planningOn({ mode: "basic" })).toBe(false);
        expect(planningOn({ mode: "off" })).toBe(false);
    });
});

describe("textOf: the words in a stored message", () => {
    it("joins text parts by line and skips everything else", () => {
        expect(
            textOf([
                { type: "text", text: "first" },
                { type: "tool-create_tasks", input: {} },
                { type: "text", text: "second" },
            ]),
        ).toBe("first\nsecond");
    });

    it.each([
        ["not an array", "hello"],
        ["null", null],
        ["an empty list", []],
        [
            "only whitespace parts",
            [
                { type: "text", text: "   " },
                { type: "text", text: "\n" },
            ],
        ],
        ["junk parts", [null, 1, "x", {}, { type: "text" }, { type: "text", text: null }]],
    ])("gives an empty string for %s", (_name, parts) => {
        expect(textOf(parts)).toBe("");
    });

    it("keeps unicode and does not trim inside the text", () => {
        expect(textOf([{ type: "text", text: "  歯医者  🦷 \n at 3 " }])).toBe("歯医者  🦷 \n at 3");
    });
});
