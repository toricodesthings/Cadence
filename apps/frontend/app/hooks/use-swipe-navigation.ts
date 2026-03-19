import { useRef, useCallback, type RefObject } from "react";

interface UseSwipeNavigationOptions {
    onSwipeLeft: () => void;
    onSwipeRight: () => void;
    threshold?: number;
}

/**
 * Adds horizontal swipe detection to a container element.
 * Returns touch handlers to spread onto the target element.
 */
export function useSwipeNavigation({
    onSwipeLeft,
    onSwipeRight,
    threshold = 50,
}: UseSwipeNavigationOptions) {
    const startX = useRef(0);
    const startY = useRef(0);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        startX.current = e.touches[0].clientX;
        startY.current = e.touches[0].clientY;
    }, []);

    const onTouchEnd = useCallback((e: React.TouchEvent) => {
        const dx = e.changedTouches[0].clientX - startX.current;
        const dy = e.changedTouches[0].clientY - startY.current;

        // Only trigger if horizontal swipe is dominant
        if (Math.abs(dx) < threshold || Math.abs(dy) > Math.abs(dx)) return;

        if (dx > 0) {
            onSwipeRight();
        } else {
            onSwipeLeft();
        }
    }, [onSwipeLeft, onSwipeRight, threshold]);

    return { onTouchStart, onTouchEnd };
}
