import { describe, expect, it } from "vitest";
import { pickChatModel } from "../../src/domains/ai/model-router";
import type { Env } from "../../src/types/env";

const env = (overrides: Partial<Env> = {}) => ({ AI_CHAT_MODEL: "std/model", AI_CHAT_MODEL_BASIC: "basic/model", ...overrides }) as Env;
const pick = (text: string, imageCount = 0, e = env()) => pickChatModel(e, { text, imageCount });

describe("pickChatModel", () => {
    it.each([
        "hi",
        "thanks!",
        "good morning",
        "what can you do?",
        "help",
        "how do I add a routine?",
        "where is the weekly reset",
        "what's a focus view?",
    ])("sends small talk and how-to help to the cheap model: %s", (text) => {
        expect(pick(text)).toBe("basic/model");
    });

    it.each([
        "add milk to groceries",
        "remind me to call mom",
        "mark the dentist task done",
        "check off laundry",
        "what's on today?",
        "show my tasks",
        "what's next",
    ])("gives anything that reads or changes data to the standard model: %s", (text) => {
        expect(pick(text)).toBe("std/model");
    });

    it.each([
        "plan my afternoon",
        "how do I fit the gym in this week",
        "how can I move my routines",
        "why did my streak reset",
        "what should I work on",
        "am I overloaded",
        "yes",
        "do that",
    ])("keeps planning, judgment and unrecognised wording on the standard model: %s", (text) => {
        expect(pick(text)).toBe("std/model");
    });

    it("keeps long, multi-line, image and approval-only turns on the standard model", () => {
        expect(pick("how do I set up a routine that reminds me at several different set times during the day")).toBe("std/model");
        expect(pick("hi\nthanks")).toBe("std/model");
        expect(pick("hi", 1)).toBe("std/model");
        expect(pick("")).toBe("std/model");
    });

    it("routes nothing when no basic model is configured", () => {
        expect(pick("hi", 0, env({ AI_CHAT_MODEL_BASIC: undefined }))).toBe("std/model");
        expect(pick("hi", 0, env({ AI_CHAT_MODEL_BASIC: "  " }))).toBe("std/model");
    });

    it("never switches a thread back once anything but the basic model has run", () => {
        const turn = { text: "thanks!", imageCount: 0 };
        expect(pickChatModel(env(), turn, null)).toBe("basic/model");
        expect(pickChatModel(env(), turn, "basic/model")).toBe("basic/model");
        expect(pickChatModel(env(), turn, "std/model")).toBe("std/model");
        // A model since retired from config still counts as "not basic".
        expect(pickChatModel(env(), turn, "old/model")).toBe("std/model");
    });
});
