import { useSettings } from "./use-settings";

/** The three Task-intelligence switches, each on unless the person turned it off. */
export function useTaskIntelligence() {
    const { data: settings } = useSettings();
    const intelligence = settings?.tasks?.intelligence;
    return {
        smartSortEnabled: intelligence?.smartSortEnabled !== false,
        intelligenceEnabled: intelligence?.nlpEnabled !== false,
        focusViewsEnabled: intelligence?.focusViewsEnabled !== false,
    };
}
