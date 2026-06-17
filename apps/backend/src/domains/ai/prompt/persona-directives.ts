/**
 * Pure mapper: AssistantPersona (user settings, doc 07 §3) → explicit prompt
 * directives that color *delivery* only. Base safety/identity always outrank
 * persona — this never emits rules, only style.
 *
 * `customInstructions` is intentionally NOT included here: it is untrusted free
 * text fenced separately by the composer. Names (nickname/assistantName) ARE
 * emitted as addressing lines (the composer sanitizes them before fencing the
 * persona block, and the values flow through this mapper's output which is itself
 * placed inside the untrusted persona fence).
 *
 * Output is a newline-joined list of directive lines, ready to substitute into
 * the `persona_customization` block's {{personaDirectives}} placeholder.
 */
import type { AssistantPersona } from "./prompt-blocks.schema";

/** Persona → framing paragraph (doc 07 §3, "persona" row). */
const PERSONA_FRAMING: Record<string, string> = {
    secretary:
        "Act as an efficient, low-friction secretary: organize and execute cleanly. Stay natural and conversational while you do it — efficient, never curt or robotic.",
    coach:
        "Adopt a warmer, encouraging coach persona within the safety guardrails: motivate without pressure.",
    minimalist:
        "Adopt a minimalist persona: lists only, near-zero prose, no filler.",
    companion:
        "Adopt a gentle, high-empathy companion persona: supportive and calm.",
};

/** Tone → style directive (doc 07 §3, "tone" row). */
const TONE_DIRECTIVE: Record<string, string> = {
    neutral: "Keep a neutral, easygoing tone that takes its cue from the user — natural, not stiff.",
    warm: "Use a warm, friendly tone.",
    playful: "A light, playful tone is welcome, but stay concise.",
    clinical: "Use a precise, clinical, no-frills tone.",
};

/** Verbosity → length directive (doc 07 §3, "verbosity" row). */
const VERBOSITY_DIRECTIVE: Record<string, string> = {
    terse: "Keep replies terse: lists over paragraphs, no preamble.",
    balanced: "Keep replies balanced: brief explanation plus structure.",
    detailed: "Provide detailed replies when it genuinely helps, but stay scannable.",
};

export function personaToDirectives(assistant: AssistantPersona): string {
    const lines: string[] = [];

    const framing = PERSONA_FRAMING[assistant.persona];
    if (framing) lines.push(framing);

    const tone = TONE_DIRECTIVE[assistant.tone];
    if (tone) lines.push(tone);

    const verbosity = VERBOSITY_DIRECTIVE[assistant.verbosity];
    if (verbosity) lines.push(verbosity);

    // Emoji are allowed by default but restrained: mirror the user, never lead.
    // emoji:false → explicit suppression (doc 07 §3).
    if (assistant.emoji) {
        lines.push("Emoji are allowed but optional — use them sparingly and only to echo the user's own style; never lead with them.");
    } else {
        lines.push("Do not use emoji.");
    }

    // Addressing lines (names are user text; the composer sanitizes the persona
    // block content). Only emit when a non-empty value is present.
    const nickname = assistant.nickname?.trim();
    if (nickname) {
        lines.push(`Address the user as "${nickname}".`);
    }
    const assistantName = assistant.assistantName?.trim();
    if (assistantName) {
        lines.push(`Refer to yourself as "${assistantName}".`);
    }

    // proactiveSuggestions:false → suppress unsolicited nudges (doc 07 §3).
    if (!assistant.proactiveSuggestions) {
        lines.push("Do not surface unsolicited suggestions; only respond to explicit asks.");
    }

    return lines.join("\n");
}
