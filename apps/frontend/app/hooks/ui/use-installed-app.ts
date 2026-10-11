import { useEffect } from "react";
import { useLocation } from "react-router";
import { rememberRoute } from "../../lib/resume-route";
import { isInstalledApp, keepAppStorage, syncAppBadge } from "../../platform/installed-app";

/**
 * Mounted once in the workspace shell: what the installed app does that a tab doesn't. It saves the screen
 * for the next launch (`lib/resume-route.ts`), mirrors the bell's unread count on the app icon, and asks
 * once to keep its storage.
 */
export function useInstalledApp(unreadCount: number) {
    const { pathname } = useLocation();

    useEffect(() => {
        if (!isInstalledApp()) return;
        rememberRoute(pathname);
        // Hidden is when iOS may close the app: the time saved is when the person last saw this screen.
        const onHide = () => { if (document.visibilityState === "hidden") rememberRoute(pathname); };
        document.addEventListener("visibilitychange", onHide);
        return () => document.removeEventListener("visibilitychange", onHide);
    }, [pathname]);

    useEffect(() => {
        void syncAppBadge(unreadCount);
        // sw.js raises the badge for pushes while hidden; on return the bell's count is the truth again.
        const onShow = () => { if (document.visibilityState === "visible") void syncAppBadge(unreadCount); };
        document.addEventListener("visibilitychange", onShow);
        return () => document.removeEventListener("visibilitychange", onShow);
    }, [unreadCount]);

    useEffect(() => { void keepAppStorage(); }, []);
}
