import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { IconRail } from "./IconRail";
import { SidebarPanel } from "./SidebarPanel";
import { useSidebarStore } from "../../stores/sidebar-store";
import { X } from "lucide-react";
import type { ShellMode } from "../../hooks/ui/use-shell-mode";

/** Main sidebar — root layout composing IconRail + SidebarPanel */
export function Sidebar({
    mode,
    navOpen = false,
    onClose,
    onSearchOpen,
    onQuickAddOpen,
}: {
    mode: ShellMode;
    navOpen?: boolean;
    onClose?: () => void;
    onSearchOpen?: () => void;
    onQuickAddOpen?: () => void;
}) {
    const location = useLocation();
    const isSchedule = location.pathname === "/schedule";
    const isHabits = location.pathname === "/habits";
    const { isCollapsed, toggleCollapse, width, setWidth } = useSidebarStore();
    const [isResizing, setIsResizing] = useState(false);
    const showPersistentPanel = !isSchedule && !isHabits;
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
            // Min 180, Max 480
            if (newWidth >= 180 && newWidth <= 480) {
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

    if (mode === "wide") {
        return (
            <aside className="flex h-full shrink-0 relative z-40" aria-label="Application navigation">
                <IconRail onSearchOpen={onSearchOpen} onQuickAddOpen={onQuickAddOpen} />
                <AnimatePresence initial={false}>
                    {showPersistentPanel && !isCollapsed && (
                        <motion.div
                            id="sidebar-panel"
                            key="sidebar-panel"
                            initial={{ width: 0 }}
                            animate={{ width }}
                            exit={{ width: 0 }}
                            transition={sidebarMotionTransition}
                            style={{ overflow: "hidden", willChange: "width" }}
                            className="relative shrink-0 group/sidebar"
                        >
                            <motion.div
                                initial={{ x: -32, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: -24, opacity: 0 }}
                                transition={sidebarMotionTransition}
                                className="relative h-full"
                                style={{ width, willChange: "transform, opacity" }}
                            >
                                <SidebarPanel onSearchOpen={onSearchOpen} onQuickAddOpen={onQuickAddOpen} />

                                <div
                                    onMouseDown={startResizing}
                                    className={`
                                        absolute top-0 right-0 h-full w-1 cursor-col-resize z-50
                                        transition-colors duration-200
                                        ${isResizing ? "bg-lantern/40" : "hover:bg-lantern/20"}
                                    `}
                                />
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </aside>
        );
    }

    if (mode === "laptop") {
        const laptopWidth = Math.max(260, width);

        return (
            <AnimatePresence initial={false}>
                {showPersistentPanel && !isCollapsed && (
                    <motion.aside
                        id="sidebar-panel"
                        key="laptop-sidebar"
                        initial={{ width: 0 }}
                        animate={{ width: laptopWidth }}
                        exit={{ width: 0 }}
                        transition={sidebarMotionTransition}
                        className="sticky top-0 relative h-dvh shrink-0 self-start overflow-hidden border-r border-twilight-border bg-twilight-surface/35 backdrop-blur-xl"
                        aria-label="Application navigation"
                    >
                        <motion.div
                            initial={{ x: -32, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: -24, opacity: 0 }}
                            transition={sidebarMotionTransition}
                            className="relative h-full"
                            style={{ width: laptopWidth, willChange: "transform, opacity" }}
                        >
                            <SidebarPanel showWorkspaceNav={showWorkspaceNav} onSearchOpen={onSearchOpen} onQuickAddOpen={onQuickAddOpen} />

                            <div
                                onMouseDown={startResizing}
                                className={`
                                    absolute top-0 right-0 h-full w-1 cursor-col-resize z-50
                                    transition-colors duration-200
                                    ${isResizing ? "bg-lantern/40" : "hover:bg-lantern/20"}
                                `}
                            />
                        </motion.div>
                    </motion.aside>
                )}
            </AnimatePresence>
        );
    }

    return (
        <AnimatePresence>
            {navOpen && (
                <>
                    <motion.button
                        key="nav-backdrop"
                        type="button"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-twilight-void/70 backdrop-blur-md"
                        aria-label="Close navigation"
                        onClick={onClose}
                    />

                    <motion.aside
                        id="sidebar-panel"
                        key="nav-drawer"
                        initial={{ x: -28, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -28, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="safe-top safe-bottom fixed inset-y-0 left-0 z-50 flex w-[min(92vw,24rem)] flex-col border-r border-twilight-border bg-twilight-deep/96 shadow-2xl shadow-black/40 backdrop-blur-2xl"
                        aria-label="Application navigation"
                    >
                        <div className="flex items-center justify-between border-b border-twilight-border px-4 py-4">
                            <div className="flex items-center gap-3">
                                <img src="/logo.png" alt="Cadence" className="h-10 w-10 rounded-2xl object-cover" />
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-twilight-text-soft">
                                        Navigation
                                    </p>
                                    <h2 className="mt-1 font-display text-lg font-semibold text-twilight-text">
                                        Cadence
                                    </h2>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close navigation"
                                className="btn-icon text-twilight-text-muted hover:bg-white/[0.05] hover:text-twilight-text"
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        </div>

                        <SidebarPanel showWorkspaceNav onSearchOpen={onSearchOpen} onQuickAddOpen={onQuickAddOpen} />
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}
