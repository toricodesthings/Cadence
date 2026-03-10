import { useState, useRef, useCallback, useEffect } from "react";

interface ResizableSidePanelProps {
    children: React.ReactNode;
    defaultWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    ariaLabel?: string;
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
}: ResizableSidePanelProps) {
    const [panelWidth, setPanelWidth] = useState(defaultWidth);
    const isDragging = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        startX.current = e.clientX;
        startWidth.current = panelWidth;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, [panelWidth]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging.current) return;
            const delta = startX.current - e.clientX;
            const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth.current + delta));
            setPanelWidth(newWidth);
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
    }, [minWidth, maxWidth]);

    return (
        <>
            {/* Resize handle */}
            <div
                onMouseDown={handleMouseDown}
                className="w-1 shrink-0 cursor-col-resize hover:bg-lantern/20 active:bg-lantern/30 transition-colors relative z-10 group"
                role="slider"
                aria-orientation="vertical"
                aria-label={ariaLabel}
                aria-valuenow={panelWidth}
                aria-valuemin={minWidth}
                aria-valuemax={maxWidth}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === "ArrowRight") {
                        e.preventDefault();
                        setPanelWidth((w) => Math.min(maxWidth, w + 20));
                    } else if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        setPanelWidth((w) => Math.max(minWidth, w - 20));
                    }
                }}
            >
                {/* Visible lantern drag indicator on hover */}
                <div className="absolute inset-y-0 -left-0.5 w-1.5 rounded-full opacity-0 group-hover:opacity-100 bg-lantern/25 transition-opacity" />
            </div>

            {/* Panel container — spans full height (overtakes toolbar thanks to MainLayout flex) */}
            <div
                className="shrink-0 border-l border-twilight-border overflow-hidden"
                style={{ width: panelWidth }}
            >
                {children}
            </div>
        </>
    );
}
