import { animate, useMotionValue, useReducedMotionConfig } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { SPRINGS } from "../../lib/constants/motion";

/** Movement past this many px turns a press into a scrub. */
const SCRUB_SLOP = 6;
const HELD_SCALE = 1.12;

export type Span = { left: number; width: number };

/** Where a remembered lens last rested, so a row that remounts (the dock, on every route) glides from there. */
const lastRest = new Map<string, Span>();

/** The item whose centre is nearest `x`, or null when `x` is over an excluded span (the dock's orb). */
export function nearestIndex(x: number, items: Span[], exclude: Span[] = []): number | null {
    if (!items.length || exclude.some((s) => x >= s.left && x <= s.left + s.width)) return null;
    let best = 0;
    for (let i = 1; i < items.length; i++) {
        const centre = (s: Span) => s.left + s.width / 2;
        if (Math.abs(centre(items[i]) - x) < Math.abs(centre(items[best]) - x)) best = i;
    }
    return best;
}

/** The lens's left edge for a finger at `x`, kept between the first and last item. */
export function clampLens(x: number, items: Span[], width: number): number {
    if (!items.length) return 0;
    const min = items[0].left;
    const max = items[items.length - 1].left + items[items.length - 1].width - width;
    return Math.min(Math.max(x - width / 2, min), Math.max(min, max));
}

/**
 * A lens behind the active item of a row (the dock, a segmented control) that glides when the
 * active item changes. On touch or pen, press-and-hold swells it, dragging scrubs it under the
 * finger, and lifting commits the nearest item; lifting over a `[data-lens-exclude]` element
 * cancels. A tap still goes to the item's own click. Mouse and keyboard are untouched.
 * Items are the track's `[data-lens-item]` descendants, in DOM order. `rememberAs` names a row that
 * remounts, so its lens glides from where it last rested instead of appearing in place.
 */
export function useLensScrub({ activeIndex, onCommit, rememberAs }: { activeIndex: number; onCommit: (index: number) => void; rememberAs?: string }) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const x = useMotionValue(0);
    const width = useMotionValue(0);
    const scale = useMotionValue(1);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [held, setHeld] = useState(false);
    // The app-wide MotionConfig (the Motion setting, else the OS); imperative animate() ignores it otherwise.
    const reduced = Boolean(useReducedMotionConfig());
    const spans = useRef<{ items: Span[]; exclude: Span[] }>({ items: [], exclude: [] });
    const press = useRef<{ id: number; startX: number; scrubbing: boolean; hover: number | null } | null>(null);
    const placed = useRef(false);

    const measure = useCallback(() => {
        const track = trackRef.current;
        if (!track) return spans.current;
        const origin = track.getBoundingClientRect().left;
        const span = (el: Element): Span => { const r = el.getBoundingClientRect(); return { left: r.left - origin, width: r.width }; };
        spans.current = {
            items: Array.from(track.querySelectorAll("[data-lens-item]"), span),
            exclude: Array.from(track.querySelectorAll("[data-lens-exclude]"), span),
        };
        return spans.current;
    }, []);

    const glideTo = useCallback((index: number, instant = false) => {
        const target = spans.current.items[index];
        if (!target) return;
        const transition = instant || reduced ? { duration: 0 } : SPRINGS.GLIDE;
        void animate(x, target.left, transition);
        void animate(width, target.width, transition);
        if (rememberAs) lastRest.set(rememberAs, target);
    }, [reduced, rememberAs, width, x]);

    // At rest the lens sits on the active item; a change slides it there. The first placement is
    // instant, unless a remembered row left a resting place to glide from.
    useLayoutEffect(() => {
        measure();
        if (press.current?.scrubbing) return;
        const from = !placed.current && rememberAs ? lastRest.get(rememberAs) : undefined;
        if (from) { x.jump(from.left); width.jump(from.width); }
        glideTo(activeIndex, !placed.current && !from);
        placed.current = spans.current.items.length > 0;
    }, [activeIndex, glideTo, measure, rememberAs, width, x]);

    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const observer = new ResizeObserver(() => { measure(); if (!press.current) glideTo(activeIndex, true); });
        observer.observe(track);
        return () => observer.disconnect();
    }, [activeIndex, glideTo, measure]);

    const release = useCallback((commit: boolean) => {
        const current = press.current;
        press.current = null;
        setHeld(false);
        setHoverIndex(null);
        void animate(scale, 1, reduced ? { duration: 0 } : SPRINGS.SNAP);
        if (!current?.scrubbing) return;
        const index = commit ? current.hover : null;
        glideTo(index ?? activeIndex);
        if (index === null || index === activeIndex) return;
        // The touch that scrubbed may still produce a click on whatever it ended over: swallow it.
        const track = trackRef.current;
        const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
        track?.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => track?.removeEventListener("click", swallow, { capture: true }), 400);
        onCommit(index);
    }, [activeIndex, glideTo, onCommit, reduced, scale]);

    const handlers = {
        onPointerDown: (event: ReactPointerEvent) => {
            if (event.pointerType === "mouse" || !event.isPrimary) return;
            measure();
            press.current = { id: event.pointerId, startX: event.clientX, scrubbing: false, hover: null };
            setHeld(true);
            void animate(scale, HELD_SCALE, reduced ? { duration: 0 } : SPRINGS.SNAP);
        },
        onPointerMove: (event: ReactPointerEvent) => {
            const current = press.current;
            const track = trackRef.current;
            if (!current || !track || event.pointerId !== current.id) return;
            if (!current.scrubbing && Math.abs(event.clientX - current.startX) <= SCRUB_SLOP) return;
            current.scrubbing = true;
            const finger = event.clientX - track.getBoundingClientRect().left;
            const { items, exclude } = spans.current;
            x.set(clampLens(finger, items, width.get()));
            current.hover = nearestIndex(finger, items, exclude);
            setHoverIndex(current.hover);
        },
        onPointerUp: (event: ReactPointerEvent) => { if (event.pointerId === press.current?.id) release(true); },
        // The OS took the touch: glide back, commit nothing.
        onPointerCancel: (event: ReactPointerEvent) => { if (event.pointerId === press.current?.id) release(false); },
    };

    return { trackRef, lens: { x, width, scale }, handlers, hoverIndex, held };
}
