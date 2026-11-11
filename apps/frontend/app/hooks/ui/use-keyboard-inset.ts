import { useEffect, useRef, useState } from "react";

/** A keyboard shorter than this is browser chrome (the URL bar), not a keyboard. */
const KEYBOARD_MIN = 120;

/**
 * How far the on-screen keyboard covers the layout viewport, from `visualViewport` (iOS Safari has neither
 * the VirtualKeyboard API nor `interactive-widget`). `last` remembers the keyboard so a panel can take
 * its place at the same height. Inactive hooks cost nothing.
 */
export function useKeyboardInset(active: boolean) {
    const [inset, setInset] = useState(0);
    // The visible height above the keyboard. iOS may also pan the page up (`offsetTop`), so this, not
    // `100dvh - inset`, is how tall a sheet can be without its top leaving the screen. `inset` is how much
    // of the layout the keyboard covers (0 when panned clear), i.e. where a fixed bottom edge belongs.
    const [visible, setVisible] = useState(0);
    const last = useRef(0);

    useEffect(() => {
        const vv = window.visualViewport;
        if (!active || !vv) {
            setInset(0);
            setVisible(0);
            return;
        }
        const read = () => {
            // The keyboard is up when the visible height drops, even if iOS panned the whole page up to
            // reveal a field (then `offsetTop` is the keyboard and nothing of the layout is covered).
            const keys = Math.round(window.innerHeight - vv.height);
            const up = keys >= KEYBOARD_MIN;
            const next = up ? Math.max(0, keys - Math.round(vv.offsetTop)) : 0;
            if (up) last.current = keys;
            setInset((prev) => (prev === next ? prev : next));
            const room = up ? Math.round(vv.height) : 0;
            setVisible((prev) => (prev === room ? prev : room));
        };
        read();
        vv.addEventListener("resize", read);
        vv.addEventListener("scroll", read);
        return () => {
            vv.removeEventListener("resize", read);
            vv.removeEventListener("scroll", read);
        };
    }, [active]);

    return { inset, last, aboveKeyboard: aboveKeyboardHeight(visible) };
}

/** The tallest a sheet may be while the keyboard is up (a safe-area gap at the top); null without a keyboard. */
export const aboveKeyboardHeight = (visible: number) => (visible ? `calc(${visible}px - max(0.5rem, env(safe-area-inset-top)))` : null);
