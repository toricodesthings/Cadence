import { useEffect } from "react";
import { useLocation } from "react-router";
import { noteWorkspacePath, rememberRoute } from "../../lib/resume-route";
import { isInstalledApp, keepAppStorage, syncAppBadge } from "../../platform/installed-app";

export function useInstalledApp(unreadCount: number) {
    const { pathname, search } = useLocation();

    useEffect(() => noteWorkspacePath(pathname, search), [pathname, search]);

    useEffect(() => {
        if (!isInstalledApp()) return;
        rememberRoute(pathname);
        const onHide = () => {
            if (document.visibilityState === "hidden") rememberRoute(pathname);
        };
        document.addEventListener("visibilitychange", onHide);
        return () => document.removeEventListener("visibilitychange", onHide);
    }, [pathname]);

    useEffect(() => {
        void syncAppBadge(unreadCount);
        const onShow = () => {
            if (document.visibilityState === "visible") void syncAppBadge(unreadCount);
        };
        document.addEventListener("visibilitychange", onShow);
        return () => document.removeEventListener("visibilitychange", onShow);
    }, [unreadCount]);

    useEffect(() => {
        void keepAppStorage();
    }, []);
}
