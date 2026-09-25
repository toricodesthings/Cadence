import { useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { useReducedMotionSetting } from "./use-reduced-motion";

/** Distance (px) past which releasing commits to the neighbouring period. */
const COMMIT_DISTANCE = 64;
/** Horizontal velocity (px/s) past which a short flick commits anyway. */
const COMMIT_VELOCITY = 340;

export interface UsePeriodSwipeOptions {
    /** Wire the gesture up only where it belongs (compact shells, no task drag in flight). */
    enabled: boolean;
    /** `-1` = previous period, `1` = next period. */
    onCommit: (delta: number) => void;
}

/**
 * Horizontal drag-to-change-period for calendar surfaces.
 *
 * The content follows the finger with elastic resistance and either completes
 * past a distance *or* velocity threshold, or springs back — the native feel a
 * plain touchend distance check can't give. `dragDirectionLock` plus framer's
 * `touch-action: pan-y` leave vertical scrolling inside timelines untouched.
 *
 * Under reduced motion the follow is flattened to zero travel while the same
 * release thresholds still navigate.
 */
export function usePeriodSwipe({ enabled, onCommit }: UsePeriodSwipeOptions) {
    const reducedMotion = useReducedMotionSetting();

    const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
        const { x, y } = info.offset;
        // A dominantly vertical pan belongs to the timeline, not to navigation.
        if (Math.abs(x) <= Math.abs(y)) return;

        const velocity = info.velocity.x;
        const flicked = Math.abs(velocity) > COMMIT_VELOCITY && Math.sign(velocity) === Math.sign(x);
        if (Math.abs(x) < COMMIT_DISTANCE && !flicked) return;

        onCommit(x < 0 ? 1 : -1);
    }, [onCommit]);

    return {
        reducedMotion,
        dragProps: {
            drag: (enabled ? "x" : false) as "x" | false,
            dragDirectionLock: true,
            dragMomentum: false,
            dragConstraints: { left: 0, right: 0 },
            dragElastic: reducedMotion ? 0 : 0.24,
            dragTransition: { bounceStiffness: 420, bounceDamping: 38 },
            onDragEnd: enabled ? handleDragEnd : undefined,
        },
    };
}
