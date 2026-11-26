import { useCallback } from "react";
import { useSettings, useUpdateSettings } from "../core/use-settings";

export type ViewMode = "list" | "kanban";

export function useViewMode() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const view: ViewMode = settings?.tasks?.defaultView ?? "list";

    const setView = useCallback(
        (mode: ViewMode) => {
            updateSettings.mutate({ tasks: { defaultView: mode } });
        },
        [updateSettings],
    );

    return { view, setView } as const;
}
