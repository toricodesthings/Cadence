import { useEffect } from "react";
import { useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";
import { IconRail } from "./IconRail";
import { SidebarPanel } from "./SidebarPanel";
import { useSidebarStore } from "../../stores/sidebar-store";

/** Main sidebar — root layout composing IconRail + SidebarPanel */
export function Sidebar() {
    const location = useLocation();
    const isSchedule = location.pathname === "/schedule";
    const isHabits = location.pathname === "/habits";
    const { isCollapsed, toggleCollapse } = useSidebarStore();

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

    return (
        <aside className="flex h-full shrink-0" aria-label="Application navigation">
            <IconRail />
            <AnimatePresence initial={false}>
                {!isSchedule && !isHabits && !isCollapsed && (
                    <motion.div
                        key="sidebar-panel"
                        initial={{ x: -224, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -224, opacity: 0 }}
                        transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 35,
                        }}
                        style={{ overflow: "hidden", width: 224 }}
                        className="shrink-0"
                    >
                        <SidebarPanel />
                    </motion.div>
                )}
            </AnimatePresence>
        </aside>
    );
}
