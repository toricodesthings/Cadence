import { useSettings } from "./use-settings";

/** The Task-intelligence switches, each on unless the person turned it off. */
export function useTaskIntelligence() {
    const { data: settings } = useSettings();
    const intelligence = settings?.tasks?.intelligence;
    return {
        intelligenceEnabled: intelligence?.nlpEnabled !== false,
        focusViewsEnabled: intelligence?.focusViewsEnabled !== false,
    };
}
