import { useShellMode } from "./use-shell-mode";
import { useSidebarStore } from "../../stores/sidebar-store";

/**
 * The list panel beside the rail: docked on wide screens (its open state kept), a drawer over the content on
 * laptop widths, so the content keeps its width (Material's medium window: rail, plus a drawer on demand).
 */
export function useNavPanel() {
    const { isLaptop } = useShellMode();
    const { isCollapsed, drawerOpen, toggleCollapse, setDrawerOpen } = useSidebarStore();
    return {
        overlay: isLaptop,
        open: isLaptop ? drawerOpen : !isCollapsed,
        toggle: isLaptop ? () => setDrawerOpen(!drawerOpen) : toggleCollapse,
        close: () => setDrawerOpen(false),
    };
}
