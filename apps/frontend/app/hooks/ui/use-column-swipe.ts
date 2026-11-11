import { animate, useMotionValue, useReducedMotionConfig } from "framer-motion";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Finger travel before the gesture picks an axis. */
const LOCK_SLOP = 8;
/** Horizontal must beat vertical by this much, so scrolling the column never moves it. */
const DIRECTION_RATIO = 1.2;
/** Past this share of the width a release turns the page; a flick (px/ms) needs only a little travel. */
const COMMIT_SHARE = 0.35;
const FLICK_SPEED = 0.4;
const FLICK_MIN = 24;
/** Space between neighbouring columns while they slide (the strip's `ml-4` / `mr-4`). */
export const PAGE_GAP = 16;
const SETTLE = { type: "spring", visualDuration: 0.38, bounce: 0 } as const;

/** Where a released drag goes: 1 = next column, -1 = previous, 0 = back to this one. */
export function settleDirection(dx: number, velocity: number, width: number): -1 | 0 | 1 {
    const flick = Math.abs(velocity) >= FLICK_SPEED && Math.abs(dx) >= FLICK_MIN && Math.sign(velocity) === Math.sign(dx);
    if (!flick && Math.abs(dx) < width * COMMIT_SHARE) return 0;
    return dx < 0 ? 1 : -1;
}

/** Past the first or last column the page resists, the further the harder (iOS rubber band). */
export const rubberBand = (dx: number, width: number) => Math.sign(dx) * (1 - 1 / ((Math.abs(dx) * 0.55) / width + 1)) * width;

/** A touch here belongs to something else: a field, a row being dragged, a sideways scroller. */
function ownedElsewhere(target: EventTarget | null, root: HTMLElement): boolean {
    if (document.querySelector('[aria-roledescription][aria-pressed="true"]')) return true; // dnd-kit drag in flight
    for (let el = target instanceof Element ? target : null; el && el !== root; el = el.parentElement) {
        if (el.matches("input, textarea, select, [contenteditable=''], [contenteditable='true'], [data-lens-item]")) return true;
        if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
    }
    return false;
}

type Gesture = { x: number; y: number; lock: "x" | "y" | null; width: number; lastX: number; lastT: number; velocity: number };

/**
 * A compact board's columns as pages: the column follows the finger sideways with its neighbours beside it,
 * resists past the ends, and springs on release (carrying the flick's speed) to the next page or back.
 * `x` drives the strip; `peek` says when to mount the neighbours. Vertical scroll and dnd-kit's long-press
 * keep the finger: the axis is chosen once per touch, and a drag in flight cancels the swipe.
 */
export function useColumnSwipe({ index, count, onChange }: { index: number; count: number; onChange: (index: number) => void }) {
    const x = useMotionValue(0);
    const reduced = Boolean(useReducedMotionConfig());
    const [peek, setPeek] = useState(false);
    const gesture = useRef<Gesture | null>(null);
    const latest = useRef({ index, count, onChange, reduced });
    latest.current = { index, count, onChange, reduced };

    // A new page (from a swipe or the chooser) sits at rest the frame it renders.
    useLayoutEffect(() => { x.jump(0); }, [index, x]);

    const ref = useCallback((root: HTMLElement | null) => {
        if (!root) return;
        const start = (e: TouchEvent) => {
            const t = e.touches[0];
            gesture.current = e.touches.length === 1 && !x.isAnimating() && !ownedElsewhere(e.target, root)
                ? { x: t.clientX, y: t.clientY, lock: null, width: root.clientWidth, lastX: t.clientX, lastT: e.timeStamp, velocity: 0 }
                : null;
        };
        const move = (e: TouchEvent) => {
            const g = gesture.current;
            const t = e.touches[0];
            if (!g || !t || g.lock === "y") return;
            const dx = t.clientX - g.x;
            const dy = t.clientY - g.y;
            if (!g.lock) {
                if (Math.hypot(dx, dy) < LOCK_SLOP) return;
                g.lock = Math.abs(dx) >= Math.abs(dy) * DIRECTION_RATIO ? "x" : "y";
                if (g.lock === "y") return;
                setPeek(true);
            }
            if (ownedElsewhere(null, root)) { cancel(); return; }
            e.preventDefault(); // ours now: no vertical drift, no browser back-swipe
            const dt = e.timeStamp - g.lastT;
            if (dt > 0) g.velocity = (t.clientX - g.lastX) / dt;
            g.lastX = t.clientX;
            g.lastT = e.timeStamp;
            const { index: i, count: n } = latest.current;
            const edge = (dx > 0 && i === 0) || (dx < 0 && i === n - 1);
            x.set(edge ? rubberBand(dx, g.width) : dx);
        };
        const settle = (to: number, velocity: number, done: () => void) => {
            const { reduced: still } = latest.current;
            void animate(x, to, still ? { duration: 0 } : { ...SETTLE, velocity: velocity * 1000 }).then(done);
        };
        const cancel = () => {
            const g = gesture.current;
            gesture.current = null;
            if (g?.lock === "x") settle(0, 0, () => setPeek(false));
        };
        const end = () => {
            const g = gesture.current;
            gesture.current = null;
            if (g?.lock !== "x") return;
            const { index: i, count: n, onChange: go } = latest.current;
            const delta = settleDirection(x.get(), g.velocity, g.width);
            const next = i + delta;
            if (!delta || next < 0 || next >= n) { settle(0, g.velocity, () => setPeek(false)); return; }
            settle(-delta * (g.width + PAGE_GAP), g.velocity, () => { setPeek(false); go(next); });
        };
        root.addEventListener("touchstart", start, { passive: true });
        root.addEventListener("touchmove", move, { passive: false });
        root.addEventListener("touchend", end);
        root.addEventListener("touchcancel", cancel);
        return () => {
            root.removeEventListener("touchstart", start);
            root.removeEventListener("touchmove", move);
            root.removeEventListener("touchend", end);
            root.removeEventListener("touchcancel", cancel);
        };
    }, [x]);

    return { ref, x, peek };
}
