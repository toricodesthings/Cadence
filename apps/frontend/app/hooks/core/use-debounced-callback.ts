import { useRef, useCallback, useEffect } from "react";

export function useDebouncedCallback<T extends (...args: never[]) => void>(
    callback: T,
    delay: number,
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const callbackRef = useRef<T>(callback);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [delay],
    );
}
