import { useEffect, useRef, useState } from "react";

const KEYBOARD_MIN = 120;

export function useKeyboardInset(active: boolean) {
    const [inset, setInset] = useState(0);
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

export const aboveKeyboardHeight = (visible: number) =>
    visible ? `calc(${visible}px - max(0.5rem, env(safe-area-inset-top)))` : null;
