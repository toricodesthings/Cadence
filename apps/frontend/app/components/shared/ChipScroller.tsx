import { useEffect, useRef, type HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

/**
 * A horizontal row of chips. Touch scrolls natively; a mouse can wheel it
 * sideways or drag it, and a drag never lands as a click on the chip under it.
 */
export function ChipScroller({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
    const ref = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Non-passive so a vertical wheel over the row scrolls it instead of the page.
        const onWheel = (e: WheelEvent) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    return (
        <div
            ref={ref}
            {...rest}
            className={cn("flex items-center gap-2 overflow-x-auto overscroll-x-contain scrollbar-hidden", className)}
            onPointerDown={(e) => {
                if (e.pointerType !== "mouse" || e.button !== 0 || !ref.current) return;
                drag.current = { x: e.clientX, left: ref.current.scrollLeft, moved: false };
            }}
            onPointerMove={(e) => {
                const d = drag.current;
                const el = ref.current;
                if (!d || !el) return;
                const dx = e.clientX - d.x;
                if (!d.moved && Math.abs(dx) < 5) return;
                if (!d.moved) {
                    d.moved = true;
                    el.setPointerCapture(e.pointerId);
                    el.style.cursor = "grabbing";
                }
                el.scrollLeft = d.left - dx;
            }}
            onPointerUp={(e) => {
                if (drag.current?.moved && ref.current) {
                    // Swallow the click this drag produces, if any, but never a later one.
                    suppressClick.current = true;
                    setTimeout(() => { suppressClick.current = false; }, 0);
                    ref.current.style.cursor = "";
                    ref.current.releasePointerCapture(e.pointerId);
                }
                drag.current = null;
            }}
            onPointerCancel={() => { drag.current = null; }}
            onClickCapture={(e) => {
                if (!suppressClick.current) return;
                suppressClick.current = false;
                e.preventDefault();
                e.stopPropagation();
            }}
        >
            {children}
        </div>
    );
}
