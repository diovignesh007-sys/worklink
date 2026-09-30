'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useSession, useUI } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { Avatar } from './ui';
import { t } from '@/lib/i18n';

const NAV = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/search', label: 'Search', icon: '🔍' },
  { href: '/create', label: 'Create', icon: '➕' },
  { href: '/work', label: 'My Work', icon: '🧰' },
  { href: '/profile', label: 'Profile', icon: '👤' },
  { href: '/chat', label: 'Chat', icon: '💬' },
  { href: '/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/safety', label: 'Safety guide', icon: '🛡️' },
  { href: '/earnings', label: 'Earnings', icon: '💰' },
  { href: '/admin', label: 'Admin', icon: '🛡️‍☠️' },
];

function DrawerContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, refresh } = useSession();
  const setDrawerOpen = useUI((s) => s.setDrawerOpen);
  const themeCtl = useThemeToggle();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 p-4 border-b border-line">
        {user ? (
          <Link href="/profile" className="flex items-center gap-3 min-w-0" onClick={onNavigate}>
            <Avatar src={user.profile.avatarUrl} name={user.profile.displayName} size={44} />
            <div className="min-w-0">
              <p className="font-bold truncate">{user.profile.displayName}</p>
              <p className="text-xs text-subtle truncate">{user.profile.headline ?? user.profile.homeCity ?? 'Welcome'}</p>
            </div>
          </Link>
        ) : (
          <Link href="/login" className="flex items-center gap-3" onClick={onNavigate}>
            <Avatar name="W" size={44} />
            <div>
              <p className="font-bold">Welcome</p>
              <p className="text-xs text-subtle">Log in or sign up</p>
            </div>
          </Link>
        )}
      </div>
      <nav aria-label="Main menu" className="flex-1 overflow-y-auto py-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className="flex items-center gap-3 px-4 py-3 hover:bg-line/40 text-[15px]"
          >
            <span aria-hidden className="text-lg w-6 text-center">{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <div className="px-4 py-3 flex items-center justify-between">
          <span className="text-[15px]">Dark mode</span>
          {themeCtl}
        </div>
      </nav>
      {user && (
        <button
          className="m-4 mt-0 rounded-full border border-line px-4 py-2.5 text-sm font-semibold hover:bg-line/40"
          onClick={async () => {
            await apiLogout();
            await refresh();
            setDrawerOpen(false);
            location.href = '/login';
          }}
        >
          {t('auth.logout')}
        </button>
      )}
    </div>
  );
}

function useThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Toggle dark mode"
      className="w-11 h-6 rounded-full bg-line relative transition-colors"
      onClick={() => setTheme(next)}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${theme === 'dark' ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

async function apiLogout() {
  const { api } = await import('@/lib/api');
  await api.logout().catch(() => undefined);
  const { setAccessToken } = await import('@/lib/api');
  setAccessToken(null);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const drawerOpen = useUI((s) => s.drawerOpen);
  const setDrawerOpen = useUI((s) => s.setDrawerOpen);
  const unreadNotifications = useUI((s) => s.unreadNotifications);
  const unreadChats = useUI((s) => s.unreadChats);
  const newPostsCount = useUI((s) => s.newPostsCount);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Global realtime badge listeners
  useEffect(() => {
    const onNotif = () => useUI.getState().setUnreadNotifications(useUI.getState().unreadNotifications + 1);
    const onMsg = () => useUI.getState().setUnreadChats(useUI.getState().unreadChats + 1);
    const onJob = () => useUI.getState().setNewPostsCount(useUI.getState().newPostsCount + 1);
    window.addEventListener('wl:notification:new', onNotif);
    window.addEventListener('wl:message:new', onMsg);
    window.addEventListener('wl:job:new', onJob);
    return () => {
      window.removeEventListener('wl:notification:new', onNotif);
      window.removeEventListener('wl:message:new', onMsg);
      window.removeEventListener('wl:job:new', onJob);
    };
  }, []);

  const bottomTabs = NAV.slice(0, 5);
  const isAuthPage = pathname === '/login' || pathname === '/signup';

  return (
    <div className="min-h-dvh">
      {/* Top bar */}
      {!isAuthPage && (
        <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-line">
          <div className="max-w-3xl mx-auto flex items-center gap-1 px-3 h-14">
            <button
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              className="p-2 -ml-1 rounded-full hover:bg-line/40"
              onClick={() => setDrawerOpen(true)}
            >
              <span aria-hidden className="block w-5 h-0.5 bg-text mb-1.5 rounded" />
              <span aria-hidden className="block w-5 h-0.5 bg-text mb-1.5 rounded" />
              <span aria-hidden className="block w-5 h-0.5 bg-text rounded" />
            </button>
            <Link href="/" className="font-black text-lg tracking-tight text-primary px-1">WorkLink</Link>
            <div className="flex-1" />
            <Link href="/search" aria-label="Search" className="p-2 rounded-full hover:bg-line/40">🔍</Link>
            <Link href="/chat" aria-label="Chat" className="relative p-2 rounded-full hover:bg-line/40">
              💬
              {unreadChats > 0 && <Badge count={unreadChats} />}
            </Link>
            <Link href="/notifications" aria-label="Notifications" className="relative p-2 rounded-full hover:bg-line/40">
              🔔
              {unreadNotifications > 0 && <Badge count={unreadNotifications} />}
            </Link>
          </div>
        </header>
      )}

      <div className="max-w-3xl mx-auto lg:max-w-5xl lg:flex lg:gap-6 lg:px-4">
        {/* Persistent sidebar ≥1024px */}
        {!isAuthPage && (
          <aside className="hidden lg:block w-60 shrink-0 py-4 sticky top-14 self-start">
            <DrawerContent />
          </aside>
        )}

        <main id="main" className="flex-1 pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Bottom tabs (mobile) */}
      {!isAuthPage && (
        <nav aria-label="Primary" className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-card border-t border-line">
          <div className="grid grid-cols-5 h-16 max-w-3xl mx-auto">
            {bottomTabs.map((tab) => {
              const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
              const isCreate = tab.href === '/create';
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? 'text-primary font-bold' : 'text-subtle'}`}
                >
                  <span aria-hidden className={isCreate ? 'text-2xl -mt-1' : 'text-xl'}>{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Drawer (mobile) */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.div
              ref={drawerRef}
              className="fixed z-50 top-0 bottom-0 left-0 w-80 max-w-[85vw] bg-card lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <DrawerContent onNavigate={() => setDrawerOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
      {count > 9 ? '9+' : count}
    </span>
  );
}
