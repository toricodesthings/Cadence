import { useCallback, useState } from "react";

function read(key: string): boolean {
    try {
        return window.localStorage.getItem(key) === "1";
    } catch {
        return false;
    }
}

/** A view preference kept on this device only (a folded section, a hidden column). If storage fails it's just forgotten. */
export function useDeviceFlag(key: string): [boolean, (next: boolean) => void] {
    const [on, setOn] = useState(() => read(key));
    const set = useCallback((next: boolean) => {
        try {
            window.localStorage.setItem(key, next ? "1" : "0");
        } catch {
            // Per-device convenience only.
        }
        setOn(next);
    }, [key]);
    return [on, set];
}
