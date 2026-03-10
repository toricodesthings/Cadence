import { useRef, useCallback, useEffect } from "react";

/**
 * Returns a debounced version of a callback. Fires only after `delay` ms of
 * inactivity since the last call. The returned function is stable (memoized).
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const callbackRef = useRef<T>(callback);

    // Keep the ref current without invalidating the returned function
    useEffect(() => {
        callbackRef.current = callback;
    });

    return useCallback(
        (...args: Parameters<T>) => {
            if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                callbackRef.current(...args);
            }, delay);
        },
        // delay is the only real dep — callback changes don't recreate the debounce wrapper
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [delay]
    );
}
