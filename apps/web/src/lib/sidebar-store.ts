import { create } from 'zustand';

// Stato condiviso della sidebar desktop (comprimibile). Sta in uno store così la
// colonna del contenuto (AppMain) può applicare il padding-left corretto e la
// navbar scorre insieme alla sidebar quando si espande (niente sovrapposizioni).
interface SidebarState {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  toggle: () => void;
}

export const useSidebar = create<SidebarState>((set) => ({
  expanded: false,
  setExpanded: (expanded) => set({ expanded }),
  toggle: () => set((state) => ({ expanded: !state.expanded })),
}));
