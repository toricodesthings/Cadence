import { useLayoutEffect, useRef } from "react";
import Picker from "@emoji-mart/react";
import data from "@emoji-mart/data";

/** emoji-mart reads its colours as "r, g, b" triplets; these Cadence tokens fill them, so it follows every theme and palette. */
const THEME = {
    "--rgb-background": "var(--color-panel-raised)",
    "--rgb-input": "var(--color-panel)",
    "--rgb-color": "var(--color-twilight-text)",
    "--rgb-accent": "var(--accent-primary)",
};

/** A resolved CSS colour as a triplet: `rgb(…)` or Chromium's `color(srgb …)` for color-mix tokens. */
export const toTriplet = (resolved: string): string => {
    const numbers = (resolved.match(/[\d.]+/g) ?? []).map(Number);
    const [r, g, b] = resolved.startsWith("color(") ? numbers.map((n) => Math.round(n * 255)) : numbers;
    return [r, g, b].join(", ");
};

export default function EmojiPicker(props: React.ComponentProps<typeof Picker>) {
    const host = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = host.current;
        if (!el) return;
        const probe = document.createElement("span");
        el.appendChild(probe);
        for (const [name, token] of Object.entries(THEME)) {
            probe.style.color = token;
            el.style.setProperty(name, toTriplet(getComputedStyle(probe).color));
        }
        probe.remove();
    }, []);
    return <div ref={host}><Picker theme="dark" {...props} data={data} /></div>;
}
