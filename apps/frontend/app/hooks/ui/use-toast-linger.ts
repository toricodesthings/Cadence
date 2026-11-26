import { useEffect, type RefObject } from "react";
import { toast } from "sonner";

export function useToastLinger(
    id: string | number,
    box: RefObject<HTMLElement | null>,
    ms: number,
    paused: boolean,
    step: unknown,
) {
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
