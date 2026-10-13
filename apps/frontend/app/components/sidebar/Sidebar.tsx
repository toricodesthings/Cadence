import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { IconRail } from "./IconRail";
import { SidebarPanel } from "./SidebarPanel";
import { useSidebarStore } from "../../stores/sidebar-store";
import { useNavPanel } from "../../hooks/ui/use-nav-panel";
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
    const { width, setWidth, setDrawerOpen } = useSidebarStore();
    const panel = useNavPanel();
    const [isResizing, setIsResizing] = useState(false);
    const showPersistentPanel = !isSchedule && !isHabits && !isEvents;
    const sidebarMotionTransition = isResizing
        ? { duration: 0 }
        : { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const };

    // Keyboard shortcut: Cmd/Ctrl + [ toggles sidebar; Escape closes the laptop drawer.
    const { toggle, close } = panel;
    const drawerOpen = panel.overlay && panel.open;
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "[") {
                e.preventDefault();
                toggle();
            } else if (drawerOpen && e.key === "Escape" && !e.defaultPrevented) {
                close();
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [toggle, close, drawerOpen]);
    // A drawer has done its job once you go somewhere.
    useEffect(() => { setDrawerOpen(false); }, [location.pathname, location.search, setDrawerOpen]);

    const startResizing = useCallback((e: React.MouseEvent) => {
        setIsResizing(true);
        e.preventDefault();
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            // The rail (56px) always sits left of the panel.
            const newWidth = e.clientX - 56;
            if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
                setWidth(newWidth);
            }
        }
    }, [isResizing, setWidth]);

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

    // Full-bleed routes (Schedule, Routines, Events) keep the docked panel out; a drawer is asked for, so it opens anywhere.
    const panelOpen = panel.overlay ? panel.open : showPersistentPanel && panel.open;

    // The rail always carries the destinations; the panel holds only what it alone has (lists, tags), never a copy.
    return (
        <aside className={`${drawerOpen ? "layer-floating-bar" : "layer-shell-base"} relative flex h-full shrink-0`} aria-label="Application navigation">
            <IconRail onSearchOpen={onSearchOpen} onQuickAddOpen={onQuickAddOpen} />
            {/* Outside the drawer (the rail stays live): a click closes it. */}
            {drawerOpen ? <div className="fixed inset-y-0 left-14 right-0" onClick={close} aria-hidden="true" /> : null}
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
                        className={panel.overlay
                            ? "glass-surface absolute left-full top-0 h-full border-r border-twilight-border shadow-2xl shadow-black/40"
                            : "relative shrink-0 group/sidebar"}
                    >
                        <motion.div
                            initial={{ x: -32, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -24, opacity: 0 }}
                            transition={sidebarMotionTransition}
                            className="relative h-full w-full"
                            style={{ willChange: "transform, opacity" }}
                        >
                            <SidebarPanel onSearchOpen={onSearchOpen} />

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
