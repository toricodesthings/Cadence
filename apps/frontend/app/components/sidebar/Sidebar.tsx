import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { IconRail } from "./IconRail";
import { SidebarPanel } from "./SidebarPanel";
import { useSidebarStore } from "../../stores/sidebar-store";
import type { ShellMode } from "../../hooks/ui/use-shell-mode";

/** Resize bounds — one honest minimum (`--sidebar-min-width`) shared by the
 * wide-rail drag floor and the laptop panel, so the rail never silently forces
 * a different second minimum. Below this, content truncates rather than the
 * rail clipping (§4.8). */
const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 480;

/** Main sidebar — root layout composing IconRail + SidebarPanel */
export function Sidebar({
    mode,
    onSearchOpen,
    onQuickAddOpen,
}: {
    mode: ShellMode;
    onSearchOpen?: () => void;
    onQuickAddOpen?: () => void;
}) {
    const location = useLocation();
    const isSchedule = location.pathname === "/schedule";
    const isHabits = location.pathname === "/routines";
    const isEvents = location.pathname === "/events";
    const { isCollapsed, toggleCollapse, width, setWidth } = useSidebarStore();
    const [isResizing, setIsResizing] = useState(false);
    const showPersistentPanel = !isSchedule && !isHabits && !isEvents;
    const showWorkspaceNav = mode !== "wide";
    const sidebarMotionTransition = isResizing
        ? { duration: 0 }
        : { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };

    // Keyboard shortcut: Cmd/Ctrl + [ toggles sidebar
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "[") {
                e.preventDefault();
                toggleCollapse();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [toggleCollapse]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            const railOffset = mode === "wide" ? 56 : 0;
            const newWidth = e.clientX - railOffset;
            if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
                setWidth(newWidth);
            }
        }
    }, [isResizing, mode, setWidth]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize);
            window.addEventListener("mouseup", stopResizing);
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
        } else {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };
    }, [isResizing, resize, stopResizing]);

    if (mode === "phone" || mode === "tablet") return null;

    const panelOpen = showPersistentPanel && !isCollapsed;

    // Laptop nav lives in the panel, so the rail only stands in while the panel is
    // hidden (collapsed, or a full-bleed route); otherwise there'd be no way to navigate.
    return (
        <aside className="layer-shell-base relative flex h-full shrink-0" aria-label="Application navigation">
            {(mode === "wide" || !panelOpen) && (
                <IconRail onSearchOpen={onSearchOpen} onQuickAddOpen={onQuickAddOpen} />
            )}
            <AnimatePresence initial={false}>
                {panelOpen && (
                    <motion.div
                        id="sidebar-panel"
                        key="sidebar-panel"
                        initial={{ width: 0 }}
                        animate={{ width: Math.max(SIDEBAR_MIN_WIDTH, width) }}
                        exit={{ width: 0 }}
                        transition={sidebarMotionTransition}
                        style={{ overflow: "hidden", willChange: "width" }}
                        className={mode === "wide"
                            ? "relative shrink-0 group/sidebar"
                            : "photo-shell-surface sticky top-0 relative h-full shrink-0 self-start border-r border-twilight-border bg-twilight-surface/35 backdrop-blur-xl"}
                    >
                        <motion.div
                            initial={{ x: -32, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -24, opacity: 0 }}
                            transition={sidebarMotionTransition}
                            className="relative h-full w-full"
                            style={{ willChange: "transform, opacity" }}
                        >
                            <SidebarPanel showWorkspaceNav={showWorkspaceNav} onSearchOpen={onSearchOpen} />

                            <div
                                onMouseDown={startResizing}
                                className={`
                                    absolute top-0 right-0 h-full w-1 cursor-col-resize z-50
                                    transition-colors duration-200
                                    ${isResizing ? "bg-accent-primary/40" : "hover:bg-accent-primary/20"}
                                `}
                            />
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </aside>
    );
}
