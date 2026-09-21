export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

/** `distance` of 0 (e.g. under reduced motion) leaves an instant switch. */
export type SlideCustom = { direction: number; distance: number };

/** Period-change slide: pass `SlideCustom` as `custom` on both `AnimatePresence` and the child. */
export const slideVariants = {
    enter: ({ direction, distance }: SlideCustom) => ({ x: direction > 0 ? distance : -distance, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: ({ direction, distance }: SlideCustom) => ({ x: direction > 0 ? -distance : distance, opacity: 0 }),
};
