'use client';

import { create } from 'zustand';
import type { SelfUser } from '@worklink/types';

interface SessionState {
  user: SelfUser | null;
  setUser: (u: SelfUser | null) => void;
  refresh: () => Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
  refresh: async () => {
    try {
      const { api } = await import('@/lib/api');
      const me = await api.me();
      set({ user: me });
    } catch {
      set({ user: null });
    }
  },
}));

interface UIState {
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  newPostsCount: number;
  setNewPostsCount: (n: number) => void;
  unreadNotifications: number;
  setUnreadNotifications: (n: number) => void;
  unreadChats: number;
  setUnreadChats: (n: number) => void;
}

export const useUI = create<UIState>((set) => ({
  drawerOpen: false,
  setDrawerOpen: (v) => set({ drawerOpen: v }),
  newPostsCount: 0,
  setNewPostsCount: (n) => set({ newPostsCount: n }),
  unreadNotifications: 0,
  setUnreadNotifications: (n) => set({ unreadNotifications: n }),
  unreadChats: 0,
  setUnreadChats: (n) => set({ unreadChats: n }),
}));
