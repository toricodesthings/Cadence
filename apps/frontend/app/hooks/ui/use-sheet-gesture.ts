import { animate, useMotionValue, useReducedMotionConfig, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { SPRINGS } from "../../lib/constants/motion";

/** Inside these a touch belongs to the control, never the sheet (dnd-kit drag sources included). */
const BLOCKED = 'input, textarea, select, [contenteditable="true"], [role="slider"], [data-sheet-no-drag], [data-dnd-draggable], [aria-roledescription="sortable"], [aria-roledescription="draggable"]';
const SLOP = 8;

export type SheetDecision = "sheet" | "native";

/** Who owns this touch, decided once, after SLOP px of movement. */
export function decide({ dx, dy, blocked, scroller }: { dx: number; dy: number; blocked: boolean; scroller: { scrollTop: number } | null }): SheetDecision {
    if (blocked || Math.abs(dx) > Math.abs(dy)) return "native";
    if (dy > 0 && (!scroller || scroller.scrollTop <= 0)) return "sheet";
    if (dy < 0 && !scroller) return "sheet";
    return "native";
}

/** Pulling a sheet up past its rest: it gives a little and resists more the further it goes. */
export const rubber = (d: number, h: number) => -(0.55 * Math.abs(d) * h) / (h + 0.55 * Math.abs(d));

/** A pull past a quarter of the sheet (at most 120px), or a downward flick. */
export const shouldDismiss = (offset: number, velocity: number, height: number) =>
    offset > 0 && (offset > Math.min(120, 0.25 * height) || velocity > 600);

/** The nearest ancestor, up to and including the sheet, that can scroll vertically. */
function scrollerOf(target: Element, sheet: Element): Element | null {
    for (let el: Element | null = target; el; el = el.parentElement) {
        const { overflowY } = getComputedStyle(el);
        if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1) return el;
        if (el === sheet) break;
    }
    return null;
}

/**
 * A bottom sheet that drags from anywhere on its surface. `y` goes on the sheet's style and
 * `backdropOpacity` on its backdrop; `onDismiss` gets the release velocity (px/s, downward).
 * ponytail: the scroll-versus-sheet decision is made once per touch, so pulling a scrolled list
 * up to its top doesn't continue into a sheet drag (lift and pull again). Upgrade: switch to a
 * sheet drag when a native scroll reaches scrollTop 0 mid-touch, which needs touchmove
 * preventDefault honoured after scrolling has started (unreliable in WebKit today).
 */
export function useSheetGesture({ element, enabled, onDismiss }: { element: HTMLElement | null; enabled: boolean; onDismiss: (velocity: number) => void }) {
    const y = useMotionValue(0);
    const height = useRef(800);
    const backdropOpacity = useTransform(y, (v) => 1 - 0.65 * Math.min(1, Math.max(0, v / height.current)));
    // The app-wide MotionConfig (the Motion setting, else the OS); imperative animate() ignores it otherwise.
    const reduced = Boolean(useReducedMotionConfig());
    const latest = useRef({ onDismiss, reduced });
    useEffect(() => { latest.current = { onDismiss, reduced }; });

    useEffect(() => {
        if (!enabled || !element) return;
        // A sheet that opens starts at rest, not where the last throw left it.
        y.jump(0);
        let start: { x: number; y: number } | null = null;
        let blocked = false;
        let scroller: Element | null = null;
        let mode: SheetDecision | null = null;
        let samples: { t: number; y: number }[] = [];
        const settle = () => animate(y, 0, latest.current.reduced ? { duration: 0 } : SPRINGS.GLIDE);

        const onStart = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (event.touches.length !== 1 || !touch) { start = null; return; }
            const target = event.target as Element;
            start = { x: touch.clientX, y: touch.clientY };
            mode = null;
            samples = [];
            blocked = Boolean(target.closest?.(BLOCKED));
            scroller = scrollerOf(target, element);
            height.current = element.offsetHeight || window.innerHeight;
        };
        const onMove = (event: TouchEvent) => {
            const touch = event.touches[0];
            if (!start || !touch) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (!mode) {
                if (Math.hypot(dx, dy) < SLOP) return;
                mode = decide({ dx, dy, blocked, scroller });
            }
            if (mode !== "sheet") return;
            event.preventDefault();
            y.set(dy > 0 ? dy : rubber(dy, height.current));
            const now = event.timeStamp;
            samples.push({ t: now, y: dy });
            samples = samples.filter((s) => now - s.t <= 100);
        };
        const onEnd = () => {
            if (mode === "sheet") {
                const first = samples[0];
                const last = samples[samples.length - 1];
                const velocity = first && last && last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
                if (shouldDismiss(y.get(), velocity, height.current)) latest.current.onDismiss(velocity);
                else settle();
            }
            start = null;
            mode = null;
        };
        const onCancel = () => {
            if (mode === "sheet") settle();
            start = null;
            mode = null;
        };

        element.addEventListener("touchstart", onStart, { passive: true });
        element.addEventListener("touchmove", onMove, { passive: false });
        element.addEventListener("touchend", onEnd);
        element.addEventListener("touchcancel", onCancel);
        return () => {
            element.removeEventListener("touchstart", onStart);
            element.removeEventListener("touchmove", onMove);
            element.removeEventListener("touchend", onEnd);
            element.removeEventListener("touchcancel", onCancel);
        };
    }, [enabled, element, y]);

    return { y, backdropOpacity, height };
}
