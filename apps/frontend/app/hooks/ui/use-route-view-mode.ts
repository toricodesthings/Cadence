import { useCallback, useState, useEffect } from "react";
import type { ViewMode } from "./use-view-mode";
import { useSettings } from "../core/use-settings";

/**
 * Route-scoped view mode.
 *
 * Reads/writes a per-route view preference via `localStorage`.
 * Falls back to the global `tasks.defaultView` setting.
 */
export function useRouteViewMode(routeKey: string) {
    const storageKey = `cadence-view-mode-${routeKey}`;
    const { data: settings } = useSettings();
    const globalDefault: ViewMode = settings?.tasks?.defaultView ?? "list";

    const [view, setViewState] = useState<ViewMode>(() => {
        if (typeof window === "undefined") return globalDefault;
        const stored = window.localStorage.getItem(storageKey);
        if (stored === "list" || stored === "kanban") return stored;
        return globalDefault;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.localStorage.getItem(storageKey);
        if (stored === "list" || stored === "kanban") {
            setViewState(stored);
        } else {
            setViewState(globalDefault);
        }
    }, [storageKey, globalDefault]);

    const setView = useCallback(
        (mode: ViewMode) => {
            setViewState(mode);
            if (typeof window !== "undefined") {
                window.localStorage.setItem(storageKey, mode);
            }
        },
        [storageKey],
    );

    return { view, setView } as const;
}
