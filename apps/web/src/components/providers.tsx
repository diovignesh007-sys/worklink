'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, setAccessToken } from '@/lib/api';
import { useSession } from '@/lib/store';
import { ThemeProvider } from '@/lib/theme';
import { connectSocket } from '@/lib/socket';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
      })
  );
  const setUser = useSession((s) => s.setUser);

  useEffect(() => {
    (async () => {
      try {
        // Refresh the access token via the httpOnly refresh cookie
        const session = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1'}/auth/session`, {
          credentials: 'include',
        }).then((r) => r.json());
        if (session.authenticated) {
          const login = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1'}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
          }).then((r) => r.json());
          if (login.accessToken) {
            setAccessToken(login.accessToken);
            setUser(login.user);
            connectSocket(login.accessToken);
          }
        }
      } catch {
        /* not logged in / offline */
      }
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
      }
    })();
  }, [setUser]);

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}
