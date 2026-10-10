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
        "mark the dentist task done",
        "check off laundry",
        "complete the quarterly report",
        "done with dishes",
        "add milk to groceries",
        "remind me to call mom",
        "what's on today?",
        "show my tasks",
        "what's next",
    ])("sends a recognised basic intent to the cheap model: %s", (text) => {
        expect(pick(text)).toBe("basic/model");
    });

    it.each([
        "plan my afternoon",
        "reschedule everything from today to tomorrow",
        "why did my streak reset",
        "mark all overdue tasks done",
        "remind me every day to stretch",
        "add milk and then move the report to friday",
        "add gym next monday at 6",
    ])("keeps planning, bulk and date-arithmetic wording on the standard model: %s", (text) => {
        expect(pick(text)).toBe("std/model");
    });

    it.each([
        "what should I work on",
        "what do you think about my week",
        "am I overloaded",
        "which of these should I drop",
        "is my week too full",
        "check if I have time for a run",
    ])("keeps judgment calls on the standard model: %s", (text) => {
        expect(pick(text)).toBe("std/model");
    });

    it.each([
        "yes",
        "yeah do it",
        "do that",
        "same as yesterday",
        "move the report to friday",
        "delete the report task",
        "empty my trash",
    ])("falls through to the standard model when no basic intent matches: %s", (text) => {
        expect(pick(text)).toBe("std/model");
    });

    it("keeps long, multi-line, image and approval-only turns on the standard model", () => {
        expect(pick("add a task to email the landlord about the broken heater in the kitchen tonight")).toBe("std/model");
        expect(pick("add milk\nadd eggs")).toBe("std/model");
        expect(pick("add this to my list", 1)).toBe("std/model");
        expect(pick("")).toBe("std/model");
    });

    it("routes nothing when no basic model is configured", () => {
        expect(pick("add milk", 0, env({ AI_CHAT_MODEL_BASIC: undefined }))).toBe("std/model");
        expect(pick("add milk", 0, env({ AI_CHAT_MODEL_BASIC: "  " }))).toBe("std/model");
    });

    it("keeps a thread that has used the standard model on it", () => {
        expect(pickChatModel(env(), { text: "add milk to groceries", imageCount: 0 }, "std/model")).toBe("std/model");
        expect(pickChatModel(env(), { text: "add milk to groceries", imageCount: 0 }, "basic/model")).toBe("basic/model");
        expect(pickChatModel(env(), { text: "add milk to groceries", imageCount: 0 }, null)).toBe("basic/model");
    });
});
