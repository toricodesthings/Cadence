import { useCallback } from "react";
import { useSettings, useUpdateSettings } from "./use-settings";

export type ViewMode = "list" | "kanban";

/**
 * Reads/writes the preferred view mode via `tasks.defaultView`.
 *
 * Persistence strategy:
 * 1. localStorage — fast read on mount (no flash)
 * 2. Backend `users.settings` JSONB — cross-device sync
 *
 * The view mode is global: switching to kanban on Today keeps it
 * when navigating to Upcoming, Completed, etc.
 *
 * Legacy `preferredView` is migrated to `tasks.defaultView` by the backend.
 */
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
