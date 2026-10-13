import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  isCollapsed: boolean;
  width: number;
  /** Laptop's panel is a drawer over the content: open only until the next move, never restored. */
  drawerOpen: boolean;
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      width: 224,
      drawerOpen: false,
      toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      setWidth: (width) => set({ width }),
    }),
    {
      name: 'cadence-sidebar-storage',
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        width: state.width,
      }),
    }
  )
);

