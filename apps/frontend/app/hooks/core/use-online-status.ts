import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
        window.removeEventListener("online", listener);
        window.removeEventListener("offline", listener);
    };
}

/** Live `navigator.onLine`; assumes online when there is no browser. */
export function useOnlineStatus(): boolean {
    return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
