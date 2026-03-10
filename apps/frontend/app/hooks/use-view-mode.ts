import { useCallback } from "react";
import { useSettings, useUpdateSettings } from "./use-settings";

export type ViewMode = "list" | "kanban";

/**
 * Reads/writes the preferred view mode.
 *
 * Persistence strategy:
 * 1. localStorage — fast read on mount (no flash)
 * 2. Backend `users.settings` JSONB — cross-device sync
 *
 * The view mode is global: switching to kanban on Today keeps it
 * when navigating to Upcoming, Completed, etc.
 */
export function useViewMode() {
    const { data: settings } = useSettings();
    const updateSettings = useUpdateSettings();

    const view: ViewMode = settings?.preferredView ?? "list";

    const setView = useCallback(
        (mode: ViewMode) => {
            updateSettings.mutate({ preferredView: mode });
        },
        [updateSettings],
    );

    return { view, setView } as const;
}
