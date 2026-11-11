import { useRef, type TouchEvent } from "react";

/** Past this many px a release changes column; a quick flick needs only half. */
const COMMIT_DISTANCE = 64;
const FLICK_SPEED = 0.5; // px/ms
/** Horizontal must beat vertical by this much, so scrolling the column never switches it. */
const DIRECTION_RATIO = 1.6;

/** Which way a finished touch moves the column: 1 = next, -1 = previous, 0 = it wasn't a swipe. */
export function swipeDirection(dx: number, dy: number, ms: number): -1 | 0 | 1 {
    if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return 0;
    const flick = ms > 0 && Math.abs(dx) / ms >= FLICK_SPEED;
    if (Math.abs(dx) < (flick ? COMMIT_DISTANCE / 2 : COMMIT_DISTANCE)) return 0;
    return dx < 0 ? 1 : -1;
}

/** A touch here belongs to something else: a field, a row being dragged, the chooser, a sideways scroller. */
function ownedElsewhere(target: EventTarget | null, root: HTMLElement): boolean {
    if (document.querySelector('[aria-roledescription][aria-pressed="true"]')) return true; // dnd-kit drag in flight
    for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
        if (el.matches("input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-lens-item]")) return true;
        if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
}

/**
 * Swipe sideways across a compact board's body to move to the next or previous column, the way the
 * chooser above it does. Passive touch listeners only: vertical scroll and dnd-kit's long-press keep the finger.
 */
export function useColumnSwipe(onSwipe: (delta: 1 | -1) => void) {
    const start = useRef<{ x: number; y: number; t: number } | null>(null);
    return {
        onTouchStart: (e: TouchEvent<HTMLElement>) => {
            const touch = e.touches[0];
            start.current = e.touches.length === 1 && !ownedElsewhere(e.target, e.currentTarget)
                ? { x: touch.clientX, y: touch.clientY, t: e.timeStamp }
                : null;
        },
        onTouchEnd: (e: TouchEvent<HTMLElement>) => {
            const from = start.current;
            start.current = null;
            const touch = e.changedTouches[0];
            if (!from || !touch || ownedElsewhere(null, e.currentTarget)) return;
            const delta = swipeDirection(touch.clientX - from.x, touch.clientY - from.y, e.timeStamp - from.t);
            if (delta) onSwipe(delta);
        },
        onTouchCancel: () => { start.current = null; },
    };
}
