import { TASK_FIELDS, useNlpParse } from "../use-nlp-parse";
import { useProjects } from "../projects/use-projects";
import { useTags } from "../tags/use-tags";
import { useSettings } from "../core/use-settings";

export function useThoughtParse(text: string, dismissedEntityIds: string[] = []) {
    const { data: projects = [] } = useProjects();
    const { data: tags = [] } = useTags();
    const { data: settings } = useSettings();
    return useNlpParse({
        input: text,
        projects,
        tags,
        dismissedEntityIds,
        // Same fields as Capture: a reminder or hide-until typed in a thought is kept, not left in the title.
        capabilities: TASK_FIELDS,
        sourceSurface: "clarify_sheet",
        dateStyle: settings?.dateTime?.dateStyle,
        enabled: settings?.tasks.intelligence?.nlpEnabled !== false,
    });
}
