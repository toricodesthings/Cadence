import { useSyncExternalStore } from "react";

/** Touch-first devices (phones, tablets). Hybrids with a mouse or trackpad don't match. */
const COARSE_POINTER_QUERY = "(hover: none) and (pointer: coarse)";

function subscribe(listener: () => void) {
    const mq = window.matchMedia(COARSE_POINTER_QUERY);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
}

export function useIsCoarsePointer(): boolean {
    return useSyncExternalStore(subscribe, () => window.matchMedia(COARSE_POINTER_QUERY).matches, () => false);
}
