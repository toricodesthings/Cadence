import { useShellMode } from "./use-shell-mode";
import { useSidebarStore } from "../../stores/sidebar-store";

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
