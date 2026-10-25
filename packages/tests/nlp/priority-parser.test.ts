import { describe, expect, it } from "vitest";
import { parsePriority } from "@cadence/nlp/parse";

const level = (text: string) => parsePriority(text).entities[0]?.normalizedValue ?? null;

describe("priority cues", () => {
    it.each([
        ["email Sam asap", 4], ["top priority: taxes", 3], ["call bank, important", 3], ["this is important", 3],
        ["call bank important tomorrow", 3], ["laundry whenever", 1], ["taxes - can wait", 1],
        ["Tidy desk no rush friday", 1], ["pay rent - no rush please", 1], ["call the bank if you can asap", 4],
        ["Urgent: what's the plan for Q3", 4], ["mark it urgent", 4],
    ])("%s → %s", (text, value) => expect(level(text)).toBe(value));

    it.each([
        "Ask boss what's important", "Figure out what is important", "Find out if it can wait", "Decide whether it can wait",
        "Call me whenever", "nothing important", "Meeting with Ms. Important", "Important email to Sam", "not urgent",
        "this isn't important", "urgent care appointment", "boss says the deck is urgent", "Jo said the permit is top priority for her",
        "client marked it urgent but it's not really", "is the dentist thing urgent?", "what's most important this week?",
        "figure out what's urgent", "decide whether the roof repair can wait", "nothing urgent, just check the mail", "pas urgent : ranger la cave",
    ])("%s stays literal", (text) => expect(level(text)).toBeNull());

    it("reads one priority per input", () => expect(parsePriority("asap !! p4").entities).toHaveLength(1));
});
