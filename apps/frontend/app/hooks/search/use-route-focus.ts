import { useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router";

export type FocusKind = "task" | "habit" | "inbox" | "section";
export type FocusSource = "search" | "quick-add" | "notification";

export interface RouteFocusParams {
    focusKind?: FocusKind;
    focusId?: string;
    focusScope?: string;
    focusDate?: string;
    focusSource?: FocusSource;
}

const FOCUS_PARAM_KEYS = ["focusKind", "focusId", "focusScope", "focusDate", "focusSource"] as const;

/** Read focus params from URL search params */
export function parseFocusParams(searchParams: URLSearchParams): RouteFocusParams | null {
    const focusKind = searchParams.get("focusKind") as FocusKind | null;
    const focusId = searchParams.get("focusId");
    if (!focusKind || !focusId) return null;

    return {
        focusKind,
        focusId,
        focusScope: searchParams.get("focusScope") ?? undefined,
        focusDate: searchParams.get("focusDate") ?? undefined,
        focusSource: (searchParams.get("focusSource") as FocusSource) ?? undefined,
    };
}

/** Build search params string for focus navigation */
export function buildFocusSearchParams(params: RouteFocusParams): string {
    const sp = new URLSearchParams();
    if (params.focusKind) sp.set("focusKind", params.focusKind);
    if (params.focusId) sp.set("focusId", params.focusId);
    if (params.focusScope) sp.set("focusScope", params.focusScope);
    if (params.focusDate) sp.set("focusDate", params.focusDate);
    if (params.focusSource) sp.set("focusSource", params.focusSource);
    return sp.toString();
}

/**
 * Route-level focus helper.
 * Reads focus params from the URL, waits for the target DOM element,
 * scrolls it into view, applies a reveal animation, then clears focus params.
 */
export function useRouteFocus(opts?: {
    /** Callback when a focus match is found — use to open a detail panel, etc. */
    onFocusMatch?: (params: RouteFocusParams) => void;
}) {
    const [searchParams, setSearchParams] = useSearchParams();
    const attemptRef = useRef(0);
    const cleanupTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    const focusParams = parseFocusParams(searchParams);

    const clearFocusParams = useCallback(() => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            FOCUS_PARAM_KEYS.forEach((key) => next.delete(key));
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    useEffect(() => {
        if (!focusParams) return;

        attemptRef.current = 0;
        const maxAttempts = 20; // ~2 seconds total
        const interval = 100;

        const tryFocus = () => {
            attemptRef.current++;

            const el = document.querySelector(
                `[data-focus-kind="${focusParams.focusKind}"][data-focus-id="${focusParams.focusId}"]`
            ) as HTMLElement | null;

            if (el) {
                // Scroll into view
                el.scrollIntoView({ behavior: "smooth", block: "center" });

                // Apply reveal animation
                el.classList.add("focus-pulse-soft");
                opts?.onFocusMatch?.(focusParams);

                // Clean up animation class after pulse completes
                cleanupTimerRef.current = setTimeout(() => {
                    el.classList.remove("focus-pulse-soft");
                    clearFocusParams();
                }, 2000);
                return;
            }

            if (attemptRef.current < maxAttempts) {
                setTimeout(tryFocus, interval);
            } else {
                // Gave up — clear params anyway to avoid stale state
                clearFocusParams();
            }
        };

        // Small initial delay for route data to load
        const startTimer = setTimeout(tryFocus, 150);

        return () => {
            clearTimeout(startTimer);
            clearTimeout(cleanupTimerRef.current);
        };
    }, [focusParams?.focusKind, focusParams?.focusId]); // eslint-disable-line react-hooks/exhaustive-deps

    return { focusParams, clearFocusParams };
}
