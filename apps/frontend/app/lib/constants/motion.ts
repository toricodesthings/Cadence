import { spring } from "framer-motion";

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

export const SPRINGS = {
    SNAP: { type: "spring", visualDuration: 0.2, bounce: 0.1 },
    GLIDE: { type: "spring", visualDuration: 0.32, bounce: 0.06 },
} as const;

export const cssSpring = ({ visualDuration, bounce }: (typeof SPRINGS)[keyof typeof SPRINGS]) =>
    String(spring({ keyframes: [0, 1], visualDuration, bounce }));

export type SlideCustom = { direction: number; distance: number; zoom?: number };

const ZOOM_STEP = 0.05;

export const slideVariants = {
    enter: ({ direction, distance, zoom = 0 }: SlideCustom) => ({
        x: direction > 0 ? distance : -distance,
        scale: 1 - zoom * ZOOM_STEP,
        opacity: 0,
    }),
    center: { x: 0, scale: 1, opacity: 1 },
    exit: ({ direction, distance, zoom = 0 }: SlideCustom) => ({
        x: direction > 0 ? -distance : distance,
        scale: 1 + zoom * ZOOM_STEP,
        opacity: 0,
    }),
};

export const bubbleIn = (reduced: boolean | null) => ({
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 10 },
    animate: reduced ? { opacity: 1 } : { opacity: 1, y: 0 },
    transition: { duration: 0.26, ease: EASE_OUT_EXPO },
});
