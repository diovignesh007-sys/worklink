'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useSession } from '@/lib/store';

interface Earnings {
  totalEarnedMinor: number;
  currency: string;
  entries: Array<{ id: string; amountMinor: number; memo: string | null; createdAt: string }>;
}

export default function EarningsPage() {
  const user = useSession((s) => s.user);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [provider, setProvider] = useState('mock');
  const [data, setData] = useState<Earnings | null>(null);

  useEffect(() => {
    api.paymentsEnabled().then((c) => {
      setEnabled(c.enabled);
      setProvider(c.provider);
      if (c.enabled) api.myEarnings().then(setData).catch(() => setData({ totalEarnedMinor: 0, currency: 'USD', entries: [] }));
    }).catch(() => setEnabled(false));
  }, []);

  if (!user) return <EmptyState icon="🔐" title="Log in to see earnings" />;
  if (enabled === null) return <div className="p-4"><Skeleton className="h-40" /></div>;

  if (!enabled) {
    return (
      <div className="p-4 max-w-xl mx-auto">
        <EmptyState
          icon="🚧"
          title="Payments are coming soon"
          hint="The escrow ledger is built and running behind a feature flag (PAYMENTS_ENABLED). Until then, settle pay directly and log hours in My Work."
        />
        <div className="flex justify-center"><Link href="/work"><Button>Go to My Work</Button></Link></div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24 max-w-xl mx-auto space-y-4">
      <h1 className="font-black text-xl">Earnings</h1>
      <div className="bg-primary text-on-primary rounded-2xl p-5">
        <p className="text-xs uppercase opacity-80">Total released to you</p>
        <p className="text-3xl font-black mt-1">{formatMoney(data?.totalEarnedMinor ?? 0, data?.currency ?? 'USD')}</p>
        <p className="text-[11px] opacity-70 mt-1">via {provider} escrow · every release is a double-entry ledger transaction</p>
      </div>

      <section>
        <h2 className="text-sm font-bold uppercase text-subtle mb-2">Recent releases</h2>
        {data && data.entries.length === 0 && <p className="text-sm text-subtle">No payments released yet. Complete an assignment and the employer releases escrow from the assignment card.</p>}
        <ul className="space-y-2">
          {data?.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between bg-card border border-line rounded-xl p-3 text-sm">
              <span>{e.memo ?? 'Release'}</span>
              <span className="font-bold text-success">+{formatMoney(e.amountMinor, data.currency)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
