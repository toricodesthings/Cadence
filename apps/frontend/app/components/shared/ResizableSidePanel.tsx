import { useState, useRef, useCallback, useEffect } from "react";

interface ResizableSidePanelProps {
    children: React.ReactNode;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    ariaLabel?: string;
    width?: number;
    onWidthChange?: (width: number) => void;
}

/**
 * Resizable side panel wrapper — shared across Planner, Inbox, Upcoming, Completed, Trash.
 * Renders a drag handle + a panel container that spans full viewport height beside MainLayout.
 */
export function ResizableSidePanel({
    children,
    defaultWidth = 320,
    minWidth = 260,
    maxWidth = 480,
    ariaLabel = "Resize side panel",
    width,
    onWidthChange,
}: ResizableSidePanelProps) {
    const [panelWidth, setPanelWidth] = useState(defaultWidth);
    const isDragging = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);
    const resolvedWidth = width ?? panelWidth;

    const updateWidth = useCallback((nextWidth: number) => {
        if (width === undefined) {
            setPanelWidth(nextWidth);
        }
        onWidthChange?.(nextWidth);
    }, [onWidthChange, width]);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        e.preventDefault();
        isDragging.current = true;
        startX.current = e.clientX;
        startWidth.current = resolvedWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, [resolvedWidth]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = startX.current - e.clientX;
            const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
            updateWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (!isDragging.current) return;
            isDragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };
    }, [maxWidth, minWidth, updateWidth]);

    return (
        <>
            {/* Resize handle */}
            <div
                onMouseDown={handleMouseDown}
                className="group relative z-10 w-1 shrink-0 cursor-col-resize transition-colors hover:bg-lantern/20 active:bg-lantern/30"
                role="slider"
                aria-orientation="vertical"
                aria-label={ariaLabel}
                aria-valuenow={resolvedWidth}
                aria-valuemin={minWidth}
                aria-valuemax={maxWidth}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        updateWidth(Math.min(maxWidth, resolvedWidth + 20));
                    } else if (e.key === "ArrowRight") {
                        e.preventDefault();
                        updateWidth(Math.max(minWidth, resolvedWidth - 20));
                    }
                }}
            >
                <div
                    className="absolute inset-y-0 -left-0.5 w-1.5 rounded-full bg-lantern/25 opacity-0 transition-opacity group-hover:opacity-100"
                />
            </div>

            {/* Panel container — spans full height (overtakes toolbar thanks to MainLayout flex) */}
            <div
                className="h-full self-stretch shrink-0 overflow-hidden border-l border-twilight-border"
                style={{ width: resolvedWidth }}
            >
                {children}
            </div>
        </>
    );
}
