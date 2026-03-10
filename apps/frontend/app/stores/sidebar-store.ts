import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  isCollapsed: boolean;
  width: number;
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setWidth: (width: number) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      width: 224,
      toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
      setWidth: (width) => set({ width }),
    }),
    {
      name: 'cadence-sidebar-storage',
    }
  )
);
