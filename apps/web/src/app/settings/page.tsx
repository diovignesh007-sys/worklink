'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, setAccessToken } from '@/lib/api';
import { useSession, useUI } from '@/lib/store';
import { useTheme } from '@/lib/theme';
import { Button, Chip } from '@/components/ui';
import type { NotificationType } from '@worklink/types';

const NOTIF_TYPES: { key: NotificationType; label: string }[] = [
  { key: 'NEW_MATCHING_JOB', label: 'New matching jobs' },
  { key: 'NEW_APPLICATION', label: 'New applications' },
  { key: 'APPLICATION_ACCEPTED', label: 'Application accepted' },
  { key: 'APPLICATION_REJECTED', label: 'Application declined' },
  { key: 'WORK_MARKED_COMPLETE', label: 'Work completed' },
  { key: 'REVIEW_RECEIVED', label: 'New review' },
  { key: 'PAYMENT_RECEIVED', label: 'Payments' },
  { key: 'MESSAGE_NEW', label: 'Messages' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const { theme, setTheme } = useTheme();
  const setUnreadNotifs = useUI((s) => s.setUnreadNotifications);
  const [currency, setCurrency] = useState('USD');
  const [language, setLanguage] = useState('en');
  const [showOnMap, setShowOnMap] = useState(true);
  const [emailNotifs, setEmailNotifs] = useState<Record<string, boolean | undefined>>({});
  const [inAppNotifs, setInAppNotifs] = useState<Record<string, boolean | undefined>>({});
  const [blocked, setBlocked] = useState<Array<{ id: string; displayName: string }>>([]);
  const [pwOpen, setPwOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setCurrency(user.settings.currency);
    setLanguage(user.settings.language);
    setShowOnMap(user.settings.privacy.showOnMap);
    setEmailNotifs({ ...(user.settings.notifications.email as Record<string, boolean>) });
    setInAppNotifs({ ...(user.settings.notifications.inApp as Record<string, boolean>) });
    api.blockedUsers().then(setBlocked).catch(() => undefined);
  }, [user]);

  if (!user) {
    return (
      <div className="p-6">
        <p className="text-sm text-subtle mb-3">Log in to manage settings.</p>
        <Link href="/login"><Button>Log in</Button></Link>
      </div>
    );
  }

  async function persist(patch: Parameters<typeof api.updateSettings>[0]) {
    await api.updateSettings(patch).catch(() => undefined);
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="p-4 pb-24 space-y-6 max-w-xl">
      <h1 className="font-black text-xl">Settings</h1>
      {saved && <p className="text-success text-sm" role="status">Saved ✓</p>}

      <Section title="Appearance">
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as const).map((th) => (
            <Chip key={th} active={theme === th} onClick={() => setTheme(th)}>{th}</Chip>
          ))}
        </div>
      </Section>

      <Section title="Language & currency">
        <label className="flex items-center justify-between text-sm">
          Language
          <select className="rounded-xl border border-line bg-card px-3 h-10" value={language} onChange={(e) => { setLanguage(e.target.value); void persist({ language: e.target.value }); }}>
            <option value="en">English</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="es">Español</option>
            <option value="ar">العربية (RTL)</option>
          </select>
        </label>
        <label className="flex items-center justify-between text-sm">
          Currency
          <input className="rounded-xl border border-line bg-card px-3 h-10 w-20 text-center" maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} onBlur={() => void persist({ currency })} />
        </label>
      </Section>

      <Section title="Notifications">
        <ul className="space-y-2">
          {NOTIF_TYPES.map((nt) => (
            <li key={nt.key} className="flex items-center justify-between text-sm">
              <span>{nt.label}</span>
              <span className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={inAppNotifs[nt.key] !== false}
                    onChange={(e) => {
                      setInAppNotifs((prev) => ({ ...prev, [nt.key]: e.target.checked }));
                      void persist({ notifications: { inApp: { [nt.key]: e.target.checked } } });
                    }}
                  />
                  in-app
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={emailNotifs[nt.key] !== false}
                    onChange={(e) => {
                      setEmailNotifs((prev) => ({ ...prev, [nt.key]: e.target.checked }));
                      void persist({ notifications: { email: { [nt.key]: e.target.checked } } });
                    }}
                  />
                  email
                </label>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Privacy">
        <label className="flex items-center justify-between text-sm">
          Show my area on the map
          <input type="checkbox" checked={showOnMap} onChange={(e) => { setShowOnMap(e.target.checked); void persist({ privacy: { profileVisibility: 'PUBLIC', showOnMap: e.target.checked } }); }} />
        </label>
        {blocked.length > 0 && (
          <div className="text-sm">
            <p className="font-semibold mb-1">Blocked users</p>
            {blocked.map((b) => (
              <div key={b.id} className="flex items-center justify-between py-1.5 border-b border-line/60">
                <span>{b.displayName}</span>
                <button className="text-accent" onClick={async () => { await api.unblock(b.id); setBlocked((prev) => prev.filter((x) => x.id !== b.id)); }}>
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Account">
        <button className="text-accent text-sm text-left" onClick={() => setPwOpen(!pwOpen)}>Change password</button>
        {pwOpen && (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await api.changePassword({ currentPassword: String(fd.get('cur')), newPassword: String(fd.get('new')) });
              alert('Password changed — please log in again');
              setAccessToken(null);
              router.push('/login');
            }}
          >
            <input name="cur" type="password" required placeholder="Current password" className="w-full h-11 rounded-xl border border-line bg-card px-3" />
            <input name="new" type="password" required minLength={8} placeholder="New password" className="w-full h-11 rounded-xl border border-line bg-card px-3" />
            <Button type="submit" size="sm">Update password</Button>
          </form>
        )}
        <button
          className="text-accent text-sm text-left"
          onClick={async () => {
            const data = await api.me();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'my-worklink-data.json';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Download my data (JSON)
        </button>
        <button
          className="text-danger text-sm text-left"
          onClick={async () => {
            if (!confirm('Deactivate your account? Your profile will be hidden and purged after 30 days.')) return;
            await api.deactivateAccount();
            setAccessToken(null);
            router.push('/');
          }}
        >
          Deactivate account
        </button>
      </Section>

      <Section title="Session">
        <div className="flex gap-2">
          <Button variant="outline" onClick={async () => {
            await api.logoutAll();
            setAccessToken(null);
            setUnreadNotifs(0);
            router.push('/login');
          }}>
            Log out of all devices
          </Button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-line rounded-2xl p-4 space-y-3">
      <h2 className="text-sm font-bold uppercase text-subtle">{title}</h2>
      {children}
    </section>
  );
}
