import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { QuickAddTab } from "../components/quick-add/QuickAddSurface";
import { getNativeStore, getWebStorage, hasDesktopWindow } from "./runtime";

const MAIN_DESKTOP_WINDOW_LABEL = "main";
const QUICK_CAPTURE_WINDOW_LABEL = "quick-capture";
const DESKTOP_COMMAND_EVENT = "cadence://desktop-command";
export const QUICK_CAPTURE_TAB_EVENT = "cadence://quick-capture-tab";
const QUICK_CAPTURE_COMPLETE_EVENT = "cadence://quick-capture-complete";
export const GLOBAL_QUICK_CAPTURE_SHORTCUT = "CommandOrControl+Shift+C";

// Loaded on use, so the web build's first screen never carries the Tauri window API.
const getCurrentWindow = async () => (await import("@tauri-apps/api/window")).getCurrentWindow();
const loadWebviewWindow = async () => (await import("@tauri-apps/api/webviewWindow")).WebviewWindow;

const DESKTOP_PREFERENCES_STORE = "cadence_desktop_preferences";
const DESKTOP_LAST_ROUTE_KEY = "last_route";
const DESKTOP_LAST_ROUTE_FALLBACK_KEY = "cadence:desktop-last-route";

export type DesktopCommandId =
    | "open-quick-capture"
    | "show-command-palette"
    | "show-search"
    | "show-settings"
    | "show-shortcuts"
    | "show-sync-inspector"
    | "sync-now"
    | "navigate-capture"
    | "navigate-schedule"
    | "navigate-habits"
    | "navigate-weekly-review"
    | "layout-scale-increase"
    | "layout-scale-decrease"
    | "layout-scale-reset";

export interface DesktopCommandPayload {
    command: DesktopCommandId;
    value?: string;
}

export interface QuickCaptureCompletionPayload {
    route: string;
}

async function getCurrentDesktopWindowLabel() {
    if (!hasDesktopWindow()) {
        return null;
    }

    return (await getCurrentWindow()).label;
}

export async function listenForDesktopCommands(handler: (payload: DesktopCommandPayload) => void) {
    if (!hasDesktopWindow()) {
        return () => undefined;
    }

    return (await getCurrentWindow()).listen<DesktopCommandPayload>(DESKTOP_COMMAND_EVENT, (event) => {
        handler(event.payload);
    });
}

export async function listenForQuickCaptureCompletions(handler: (payload: QuickCaptureCompletionPayload) => void) {
    if (!hasDesktopWindow()) {
        return () => undefined;
    }

    return (await getCurrentWindow()).listen<QuickCaptureCompletionPayload>(QUICK_CAPTURE_COMPLETE_EVENT, (event) => {
        handler(event.payload);
    });
}

export async function rememberDesktopWorkspaceRoute(route: string) {
    if (!hasDesktopWindow()) {
        return;
    }

    const store = await getNativeStore(DESKTOP_PREFERENCES_STORE).catch(() => null);
    if (store) {
        await store.set(DESKTOP_LAST_ROUTE_KEY, route);
        return;
    }

    getWebStorage()?.setItem(DESKTOP_LAST_ROUTE_FALLBACK_KEY, route);
}

export async function readRememberedDesktopWorkspaceRoute() {
    if (!hasDesktopWindow()) {
        return null;
    }

    const store = await getNativeStore(DESKTOP_PREFERENCES_STORE).catch(() => null);
    if (store) {
        const route = await store.get<string>(DESKTOP_LAST_ROUTE_KEY);
        return typeof route === "string" ? route : null;
    }

    return getWebStorage()?.getItem(DESKTOP_LAST_ROUTE_FALLBACK_KEY) ?? null;
}

export async function focusMainDesktopWindow() {
    if (!hasDesktopWindow()) {
        return;
    }

    const mainWindow = await (await import("@tauri-apps/api/window")).Window.getByLabel(MAIN_DESKTOP_WINDOW_LABEL);
    if (!mainWindow) {
        return;
    }

    await mainWindow.unminimize().catch(() => undefined);
    await mainWindow.show().catch(() => undefined);
    await mainWindow.setFocus().catch(() => undefined);
}

async function waitForWindow(webviewWindow: WebviewWindow) {
    return new Promise<void>((resolve, reject) => {
        let settled = false;

        void webviewWindow.once("tauri://created", () => {
            if (!settled) {
                settled = true;
                resolve();
            }
        });

        void webviewWindow.once("tauri://error", (event) => {
            if (!settled) {
                settled = true;
                reject(event.payload);
            }
        });
    });
}

export async function openQuickCaptureWindow(tab: QuickAddTab = "task") {
    if (!hasDesktopWindow()) {
        return;
    }

    const WebviewWindow = await loadWebviewWindow();
    const existingWindow = await WebviewWindow.getByLabel(QUICK_CAPTURE_WINDOW_LABEL);
    if (existingWindow) {
        await existingWindow.emit(QUICK_CAPTURE_TAB_EVENT, { tab }).catch(() => undefined);
        await existingWindow.unminimize().catch(() => undefined);
        await existingWindow.show().catch(() => undefined);
        await existingWindow.setFocus().catch(() => undefined);
        return;
    }

    const quickCaptureWindow = new WebviewWindow(QUICK_CAPTURE_WINDOW_LABEL, {
        url: `/desktop/quick-capture?tab=${tab}`,
        title: "Quick Capture",
        width: 460,
        height: 640,
        minWidth: 420,
        minHeight: 560,
        center: true,
        resizable: false,
        maximizable: false,
        minimizable: true,
        alwaysOnTop: true,
        focus: true,
    });

    await waitForWindow(quickCaptureWindow);
    await quickCaptureWindow.setFocus().catch(() => undefined);
}

export async function completeQuickCapture(route: string) {
    if (!hasDesktopWindow()) {
        return;
    }

    const currentWindow = await getCurrentWindow();
    await currentWindow.emitTo(MAIN_DESKTOP_WINDOW_LABEL, QUICK_CAPTURE_COMPLETE_EVENT, { route });
    await focusMainDesktopWindow();

    if (currentWindow.label === QUICK_CAPTURE_WINDOW_LABEL) {
        await currentWindow.close().catch(() => undefined);
    }
}

export async function closeCurrentDesktopWindow() {
    if (!hasDesktopWindow()) {
        return;
    }

    await (await getCurrentWindow()).close().catch(() => undefined);
}

export async function configureGlobalQuickCaptureShortcut(enabled: boolean) {
    if (!hasDesktopWindow()) {
        return;
    }

    const currentLabel = await getCurrentDesktopWindowLabel();
    if (currentLabel !== MAIN_DESKTOP_WINDOW_LABEL) {
        return;
    }

    const { isRegistered, register, unregister } = await import("@tauri-apps/plugin-global-shortcut");
    const alreadyRegistered = await isRegistered(GLOBAL_QUICK_CAPTURE_SHORTCUT).catch(() => false);

    if (alreadyRegistered) {
        await unregister(GLOBAL_QUICK_CAPTURE_SHORTCUT).catch(() => undefined);
    }

    if (!enabled) {
        return;
    }

    await register(GLOBAL_QUICK_CAPTURE_SHORTCUT, (event) => {
        if (event.state === "Pressed") {
            void openQuickCaptureWindow("task");
        }
    });
}