import { useSettings } from "../core/use-settings";

export interface AssistantPersona {
    emoji: boolean;
    terse: boolean;
}

export function useAssistantPersona(): AssistantPersona {
    const { data: settings } = useSettings();
    const assistant = settings?.assistant;
    const emoji = assistant?.emoji ?? false;
    return { emoji, terse: assistant?.persona === "minimalist" };
}
