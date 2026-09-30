'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { ReportView } from '@worklink/types';
import { Button, EmptyState, Skeleton, StatusChip } from '@/components/ui';
import { useSession } from '@/lib/store';

export default function AdminPage() {
  const user = useSession((s) => s.user);
  const [reports, setReports] = useState<ReportView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('SUSPENDED');

  const load = () => {
    api.adminReports().then((r) => setReports(r.data)).catch((e) => setError(e instanceof Error ? e.message : 'Admin access required'));
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) return <EmptyState icon="🔐" title="Admin access only" />;
  if (error) return <EmptyState icon="⛔" title="Not authorised" hint="Your account needs the admin flag (seed user demo@worklink.app is admin)." />;

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto space-y-4">
      <h1 className="font-black text-xl">Moderation</h1>

      <section className="bg-card border border-line rounded-2xl p-4 space-y-2">
        <h2 className="text-sm font-bold uppercase text-subtle">Set user status</h2>
        <div className="flex gap-2">
          <input className="flex-1 h-10 rounded-xl border border-line bg-bg px-3 text-sm" placeholder="User UUID" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <select className="h-10 rounded-xl border border-line bg-bg px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option>ACTIVE</option>
            <option>SUSPENDED</option>
            <option>SHADOW_BANNED</option>
          </select>
          <Button size="sm" onClick={async () => {
            await api.adminSetUserStatus(userId, status as 'ACTIVE');
            alert(`User set to ${status}`);
          }}>Apply</Button>
        </div>
        <p className="text-[11px] text-subtle">SUSPENDED blocks login. SHADOW_BANNED hides the user&apos;s content from others while appearing normal to them.</p>
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase text-subtle mb-2">Report queue</h2>
        {reports === null ? (
          <Skeleton className="h-24" />
        ) : reports.length === 0 ? (
          <EmptyState icon="🧹" title="Queue is clear" />
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.id} className="bg-card border border-line rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{r.targetType} · {r.reason}</p>
                  <StatusChip status={r.status} />
                </div>
                {r.details && <p className="text-xs text-subtle mt-1">{r.details}</p>}
                <p className="text-[11px] text-subtle mt-0.5">by {r.reporter.displayName} · {new Date(r.createdAt).toLocaleString()}</p>
                {r.status === 'PENDING' && (
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="outline" onClick={async () => { await api.adminDecideReport(r.id, 'DISMISS'); load(); }}>Dismiss</Button>
                    <Button size="sm" variant="danger" onClick={async () => { await api.adminDecideReport(r.id, 'ACTION'); load(); }}>Take action</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
