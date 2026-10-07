import { useEffect, useRef, useState } from "react";

/** A keyboard shorter than this is browser chrome (the URL bar), not a keyboard. */
const KEYBOARD_MIN = 120;

/**
 * How far the on-screen keyboard covers the layout viewport, from `visualViewport` (iOS Safari has neither
 * the VirtualKeyboard API nor `interactive-widget`). `lastHeight` remembers the keyboard so a panel can take
 * its place at the same height. Inactive hooks cost nothing.
 */
export function useKeyboardInset(active: boolean) {
    const [inset, setInset] = useState(0);
    const last = useRef(0);

    useEffect(() => {
        const vv = typeof window === "undefined" ? undefined : window.visualViewport;
        if (!active || !vv) {
            setInset(0);
            return;
        }
        const read = () => {
            const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
            const next = covered >= KEYBOARD_MIN ? covered : 0;
            if (next) last.current = next;
            setInset((prev) => (prev === next ? prev : next));
        };
        read();
        vv.addEventListener("resize", read);
        vv.addEventListener("scroll", read);
        return () => {
            vv.removeEventListener("resize", read);
            vv.removeEventListener("scroll", read);
        };
    }, [active]);

    return { inset, lastHeight: () => last.current };
}
