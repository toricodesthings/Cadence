import { useEffect, type RefObject } from "react";
import { toast } from "sonner";

/**
 * Closes toast `id` after `ms`, but never while the pointer or focus is inside `box` (it looks again each second).
 * Hover and focus are read live when the timer fires, not counted from events: a control that unmounts while
 * focused never blurs. Off while `paused`; re-armed whenever `step` changes.
 */
export function useToastLinger(id: string | number, box: RefObject<HTMLElement | null>, ms: number, paused: boolean, step: unknown) {
    useEffect(() => {
        if (paused) return;
        let timer: ReturnType<typeof setTimeout>;
        const arm = (wait: number) => {
            timer = setTimeout(() => {
                const el = box.current;
                if (el && (el.matches(":hover") || el.contains(document.activeElement))) arm(1_000);
                else toast.dismiss(id);
            }, wait);
        };
        arm(ms);
        return () => clearTimeout(timer);
    }, [id, box, ms, paused, step]);
}
