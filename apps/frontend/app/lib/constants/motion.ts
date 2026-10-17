import { spring } from "framer-motion";

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** Calm springs: bounce ≤ 0.15, motion for orientation, never reward. The `--spring-*` CSS tokens in app.css are generated from these (motion.test.ts enforces). */
export const SPRINGS = {
    SNAP: { type: "spring", visualDuration: 0.2, bounce: 0.1 },
    GLIDE: { type: "spring", visualDuration: 0.32, bounce: 0.06 },
    MORPH: { type: "spring", visualDuration: 0.36, bounce: 0.12 },
} as const;

/** `"<ms> linear(…)"` for CSS; paste the output into app.css when a spring changes. */
export const cssSpring = ({ visualDuration, bounce }: (typeof SPRINGS)[keyof typeof SPRINGS]) =>
    String(spring({ keyframes: [0, 1], visualDuration, bounce }));

/** `distance` of 0 (e.g. under reduced motion) leaves an instant switch.
 *  `zoom`: 1 = zooming in (Month → Day), -1 = out; leave 0 under reduced motion. */
export type SlideCustom = { direction: number; distance: number; zoom?: number };

const ZOOM_STEP = 0.05;

/** Period-change slide: pass `SlideCustom` as `custom` on both `AnimatePresence` and the child. */
export const slideVariants = {
    enter: ({ direction, distance, zoom = 0 }: SlideCustom) => ({ x: direction > 0 ? distance : -distance, scale: 1 - zoom * ZOOM_STEP, opacity: 0 }),
    center: { x: 0, scale: 1, opacity: 1 },
    exit: ({ direction, distance, zoom = 0 }: SlideCustom) => ({ x: direction > 0 ? -distance : distance, scale: 1 + zoom * ZOOM_STEP, opacity: 0 }),
};
