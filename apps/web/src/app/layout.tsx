import type { Metadata, Viewport } from 'next';
import '../styles/globals.css';
import { Providers } from '@/components/providers';
import { themeInitScript } from '@/lib/theme';
import { AppShell } from '@/components/app-shell';

export const metadata: Metadata = {
  title: 'WorkLink — find work, hire help',
  description: 'Short-term & permanent manual-work marketplace. Post jobs, find workers, chat, get paid.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'WorkLink', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c10' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
