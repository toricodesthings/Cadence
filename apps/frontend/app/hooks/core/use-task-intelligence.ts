import { useSettings } from "./use-settings";

export function useTaskIntelligence() {
    const { data: settings } = useSettings();
    const intelligence = settings?.tasks?.intelligence;
    return {
        intelligenceEnabled: intelligence?.nlpEnabled !== false,
        focusViewsEnabled: intelligence?.focusViewsEnabled !== false,
    };
}
