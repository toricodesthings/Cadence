import { useRef, useCallback } from "react";

/**
 * Hook that enables grab-to-scroll on a horizontally scrollable container.
 * Attach the returned ref to the scroll container and spread the handlers onto it.
 */
export function useDragScroll() {
    const ref = useRef<HTMLDivElement>(null);
    const isDragging = useRef(false);
    const startX = useRef(0);
    const scrollLeft = useRef(0);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        const el = ref.current;
        if (!el || e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest("article, button, input, textarea, a, select, label, [data-no-dnd], [data-dnd-card]")) return;
        e.preventDefault();
        isDragging.current = true;
        startX.current = e.clientX;
        scrollLeft.current = el.scrollLeft;
        el.style.cursor = "grabbing";
        el.style.userSelect = "none";
        el.setPointerCapture(e.pointerId);
    }, []);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        if (!isDragging.current || !ref.current) return;
        e.preventDefault();
        ref.current.scrollLeft = scrollLeft.current - (e.clientX - startX.current);
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        if (ref.current) {
            ref.current.style.cursor = "";
            ref.current.style.userSelect = "";
            ref.current.releasePointerCapture(e.pointerId);
        }
    }, []);

    return { ref, onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
