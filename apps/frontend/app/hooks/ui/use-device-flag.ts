import { useCallback, useState } from "react";

function read(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function useDeviceValue(key: string): [string | null, (next: string | null) => void] {
    const [saved, setSaved] = useState(() => ({ key, value: read(key) }));
    const set = useCallback(
        (next: string | null) => {
            try {
                if (next === null) window.localStorage.removeItem(key);
                else window.localStorage.setItem(key, next);
            } catch {}
            setSaved({ key, value: next });
        },
        [key],
    );
    return [saved.key === key ? saved.value : read(key), set];
}

export function useDeviceFlag(key: string): [boolean, (next: boolean) => void] {
    const [value, set] = useDeviceValue(key);
    return [value === "1", useCallback((next: boolean) => set(next ? "1" : "0"), [set])];
}
