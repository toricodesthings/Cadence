import type { ViewMode } from "./use-view-mode";
import { useSettings } from "../core/use-settings";
import { useDeviceValue } from "./use-device-flag";

/** Route-scoped view mode, kept on this device; falls back to the global `tasks.defaultView` setting. */
export function useRouteViewMode(routeKey: string) {
    const { data: settings } = useSettings();
    const [stored, setView] = useDeviceValue(`cadence-view-mode-${routeKey}`);
    const view: ViewMode = stored === "list" || stored === "kanban" ? stored : settings?.tasks?.defaultView ?? "list";
    return { view, setView: setView as (mode: ViewMode) => void } as const;
}
