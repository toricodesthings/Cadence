import { useCallback } from "react";
import { type PanInfo } from "framer-motion";
import { useReducedMotionSetting } from "./use-reduced-motion";

const COMMIT_DISTANCE = 64;
const COMMIT_VELOCITY = 340;

export interface UsePeriodSwipeOptions {
    enabled: boolean;
    onCommit: (delta: number) => void;
}

export function usePeriodSwipe({ enabled, onCommit }: UsePeriodSwipeOptions) {
    const reducedMotion = useReducedMotionSetting();

    const handleDragEnd = useCallback(
        (_: unknown, info: PanInfo) => {
            const { x, y } = info.offset;
            if (Math.abs(x) <= Math.abs(y)) return;

            const velocity = info.velocity.x;
            const flicked = Math.abs(velocity) > COMMIT_VELOCITY && Math.sign(velocity) === Math.sign(x);
            if (Math.abs(x) < COMMIT_DISTANCE && !flicked) return;

            onCommit(x < 0 ? 1 : -1);
        },
        [onCommit],
    );

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
