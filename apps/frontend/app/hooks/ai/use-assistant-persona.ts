/**
 * Persona-aware copy density for assistant cards (ai_frontend.md §7.3, design §4).
 *
 * The same `settings.assistant.{persona,emoji}` that shape the backend prompt
 * also drive client-side copy density:
 *  - the Minimalist voice → collapse supporting/description lines,
 *  - `emoji=false` → never prefix copy with emoji (glyphs are SVG).
 */
import { useSettings } from "../core/use-settings";

export interface AssistantPersona {
    emoji: boolean;
    /** True when descriptions/preamble lines should be dropped (Minimalist voice). */
    terse: boolean;
}

export function useAssistantPersona(): AssistantPersona {
    const { data: settings } = useSettings();
    const assistant = settings?.assistant;
    const emoji = assistant?.emoji ?? false;
    return { emoji, terse: assistant?.persona === "minimalist" };
}
