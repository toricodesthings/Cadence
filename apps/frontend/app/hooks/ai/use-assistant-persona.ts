/**
 * Persona-aware copy density for assistant cards (ai_frontend.md §7.3, design §4).
 *
 * The same `settings.assistant.{emoji,verbosity}` that flow into the backend
 * prompt also drive client-side copy density:
 *  - `verbosity=terse` → collapse supporting/description lines,
 *  - `emoji=false` (default) → never prefix copy with emoji (glyphs are SVG).
 */
import { useSettings } from "../core/use-settings";

export type Verbosity = "terse" | "balanced" | "detailed";

export interface AssistantPersona {
    emoji: boolean;
    verbosity: Verbosity;
    /** True when descriptions/preamble lines should be dropped (terse). */
    terse: boolean;
}

export function useAssistantPersona(): AssistantPersona {
    const { data: settings } = useSettings();
    const assistant = settings?.assistant;
    const emoji = assistant?.emoji ?? false;
    const verbosity = assistant?.verbosity ?? "balanced";
    return { emoji, verbosity, terse: verbosity === "terse" };
}
