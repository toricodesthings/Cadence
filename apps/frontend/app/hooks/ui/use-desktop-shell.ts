import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { IS_DESKTOP_RUNTIME } from "../../platform/runtime";
import { DESKTOP_LAYOUT_SCALE_DEFAULT } from "./use-desktop-layout-scale";
import type { QuickAddTab } from "../../components/quick-add/QuickAddSurface";
import {
    configureGlobalQuickCaptureShortcut,
    listenForDesktopCommands,
    listenForQuickCaptureCompletions,
    openQuickCaptureWindow,
    readRememberedDesktopWorkspaceRoute,
    rememberDesktopWorkspaceRoute,
    takeLaunchCommand,
    type DesktopCommandPayload,
} from "../../platform/desktop-shell";

type DesktopShellOptions = {
    /** Stable state setters: the commands listener subscribes once. */
    setCommandOpen: (open: boolean) => void;
    setSyncInspectorOpen: (open: boolean) => void;
    sync: () => unknown;
    stepLayoutScale: (direction: 1 | -1) => unknown;
    setLayoutScale: (scale: number) => unknown;
    quickCaptureShortcutEnabled: boolean;
};

/**
 * The desktop app's side of the shell (no-ops on the web): remembers the workspace route and reopens it,
 * runs menu, tray and Jump List commands, follows Quick Capture saves, and sets the global capture shortcut.
 */
export function useDesktopShell({ setCommandOpen, setSyncInspectorOpen, sync, stepLayoutScale, setLayoutScale, quickCaptureShortcutEnabled }: DesktopShellOptions) {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        const route = `${location.pathname}${location.search}`;
        if (route.startsWith("/auth") || route.startsWith("/desktop/quick-capture")) {
            return;
        }

        void rememberDesktopWorkspaceRoute(route);
    }, [location.pathname, location.search]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME || location.pathname !== "/" || location.search) {
            return;
        }

        let active = true;

        void readRememberedDesktopWorkspaceRoute().then((route) => {
            if (!active || !route || route === "/") {
                return;
            }

            navigate(route, { replace: true });
        });

        return () => {
            active = false;
        };
    }, [location.pathname, location.search, navigate]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        let unlistenCommands: (() => void) | undefined;
        let unlistenQuickCapture: (() => void) | undefined;
        let active = true;

        const handleCommand = ({ command, value }: DesktopCommandPayload) => {
            if (!active) return;
            const actions: Partial<Record<DesktopCommandPayload["command"], () => unknown>> = {
                "show-command-palette": () => setCommandOpen(true),
                "show-search": () => setCommandOpen(true),
                "open-quick-capture": () => openQuickCaptureWindow((value as QuickAddTab | undefined) ?? "task"),
                "show-settings": () => navigate(`?settings=${value ?? "account"}`),
                "show-shortcuts": () => navigate("?settings=shortcuts"),
                "show-sync-inspector": () => setSyncInspectorOpen(true),
                "sync-now": () => sync(),
                "navigate-capture": () => navigate("/"),
                "navigate-schedule": () => navigate("/schedule"),
                "navigate-habits": () => navigate("/routines"),
                "navigate-weekly-review": () => navigate("/weekly-review"),
                "layout-scale-increase": () => stepLayoutScale(1),
                "layout-scale-decrease": () => stepLayoutScale(-1),
                "layout-scale-reset": () => setLayoutScale(DESKTOP_LAYOUT_SCALE_DEFAULT),
            };
            void actions[command]?.();
        };

        void listenForDesktopCommands(handleCommand).then(async (dispose) => {
            unlistenCommands = dispose;
            // A Jump List launch that started Cadence: its command waited for this listener.
            const pending = await takeLaunchCommand();
            if (pending) handleCommand(pending);
        });

        void listenForQuickCaptureCompletions((payload) => {
            if (!active) {
                return;
            }

            navigate(payload.route, { replace: false });
        }).then((dispose) => {
            unlistenQuickCapture = dispose;
        });

        return () => {
            active = false;
            unlistenCommands?.();
            unlistenQuickCapture?.();
        };
    }, [navigate, setCommandOpen, setLayoutScale, setSyncInspectorOpen, stepLayoutScale, sync]);

    useEffect(() => {
        if (!IS_DESKTOP_RUNTIME) {
            return;
        }

        void configureGlobalQuickCaptureShortcut(quickCaptureShortcutEnabled);
    }, [quickCaptureShortcutEnabled]);
}
