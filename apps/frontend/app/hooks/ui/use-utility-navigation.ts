import { useLocation, useNavigate } from "react-router";

/** One history entry per utility sheet; detail changes stay inside that sheet. */
export function useUtilityNavigation() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const isOpen = params.has("settings") || params.has("notifications");

    function open(kind: "settings" | "notifications", value: string) {
        const next = new URLSearchParams(location.search);
        next.delete("settings");
        next.delete("notifications");
        next.set(kind, value);
        navigate({ pathname: location.pathname, search: `?${next}` }, {
            replace: isOpen,
            state: isOpen ? location.state : { utilitySheet: true },
            preventScrollReset: true,
        });
    }

    function close() {
        if (location.state?.utilitySheet) {
            navigate(-1);
            return;
        }
        const next = new URLSearchParams(location.search);
        next.delete("settings");
        next.delete("notifications");
        navigate({ pathname: location.pathname, search: next.size ? `?${next}` : "" }, { replace: true, preventScrollReset: true });
    }

    return {
        settings: params.get("settings"),
        notificationsOpen: params.has("notifications"),
        openSettings: (tab = "menu") => open("settings", tab),
        openNotifications: () => open("notifications", "true"),
        close,
    };
}
