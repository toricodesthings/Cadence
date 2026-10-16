import { useCallback, useState } from "react";

function read(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

/** A view preference kept on this device only (a folded section, a chosen view, a step). If storage fails it's just forgotten; null clears it. */
export function useDeviceValue(key: string): [string | null, (next: string | null) => void] {
    const [saved, setSaved] = useState(() => ({ key, value: read(key) }));
    const set = useCallback((next: string | null) => {
        try {
            if (next === null) window.localStorage.removeItem(key);
            else window.localStorage.setItem(key, next);
        } catch {
            // Per-device convenience only.
        }
        setSaved({ key, value: next });
    }, [key]);
    return [saved.key === key ? saved.value : read(key), set];
}

/** An on/off view preference kept on this device only. */
export function useDeviceFlag(key: string): [boolean, (next: boolean) => void] {
    const [value, set] = useDeviceValue(key);
    return [value === "1", useCallback((next: boolean) => set(next ? "1" : "0"), [set])];
}
