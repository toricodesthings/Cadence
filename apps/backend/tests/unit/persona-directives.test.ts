import { describe, expect, it } from "vitest";
import { personaToDirectives } from "../../src/domains/ai/prompt/persona-directives";
import type { AssistantPersona } from "../../src/domains/ai/prompt/prompt-blocks.schema";

function persona(overrides: Partial<AssistantPersona> = {}): AssistantPersona {
    return {
        persona: "secretary",
        tone: "neutral",
        verbosity: "balanced",
        emoji: false,
        proactiveSuggestions: true,
        memoryEnabled: false,
        adaptiveTone: true,
        ...overrides,
    };
}

describe("personaToDirectives", () => {
    it("emits the secretary framing by default", () => {
        const out = personaToDirectives(persona());
        expect(out).toContain("efficient, low-friction secretary");
    });

    it("emits coach framing and warm tone", () => {
        const out = personaToDirectives(persona({ persona: "coach", tone: "warm" }));
        expect(out).toContain("coach persona");
        expect(out).toContain("warm, friendly tone");
    });

    it("emits terse verbosity directive", () => {
        const out = personaToDirectives(persona({ verbosity: "terse" }));
        expect(out).toContain("Keep replies terse");
    });

    it("adds 'Do not use emoji.' when emoji is false", () => {
        expect(personaToDirectives(persona({ emoji: false }))).toContain("Do not use emoji.");
    });

    it("allows restrained, mirrored emoji when emoji is true", () => {
        const out = personaToDirectives(persona({ emoji: true }));
        expect(out).not.toContain("Do not use emoji.");
        expect(out.toLowerCase()).toContain("emoji");
    });

    it("emits addressing lines for nickname and assistantName", () => {
        const out = personaToDirectives(
            persona({ nickname: "Sam", assistantName: "Jeeves" }),
        );
        expect(out).toContain('Address the user as "Sam".');
        expect(out).toContain('Refer to yourself as "Jeeves".');
    });

    it("omits addressing lines when names are empty/blank", () => {
        const out = personaToDirectives(persona({ nickname: "  ", assistantName: undefined }));
        expect(out).not.toContain("Address the user as");
        expect(out).not.toContain("Refer to yourself as");
    });

    it("suppresses nudges when proactiveSuggestions is false", () => {
        const out = personaToDirectives(persona({ proactiveSuggestions: false }));
        expect(out).toContain("Do not surface unsolicited suggestions");
    });

    it("does not suppress nudges when proactiveSuggestions is true", () => {
        const out = personaToDirectives(persona({ proactiveSuggestions: true }));
        expect(out).not.toContain("Do not surface unsolicited suggestions");
    });

    it("never includes customInstructions (fenced separately by the composer)", () => {
        const out = personaToDirectives(
            persona({ customInstructions: "SECRET_STEERING_TEXT" }),
        );
        expect(out).not.toContain("SECRET_STEERING_TEXT");
    });
});
