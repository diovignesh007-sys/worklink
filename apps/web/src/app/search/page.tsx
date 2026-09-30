'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { JobSummary, PublicProfile } from '@worklink/types';
import { formatMoney, PAY_TYPE_SUFFIX } from '@/lib/format';
import { Avatar, Chip, EmptyState, Skeleton, Stars } from '@/components/ui';

const CATEGORIES = ['CONSTRUCTION', 'WAREHOUSE', 'DELIVERY', 'CLEANING', 'AGRICULTURE', 'EVENTS', 'MOVING_PACKING', 'KITCHEN_HELP', 'GARDENING', 'SECURITY', 'DRIVING', 'OTHER'];
const TRENDING = ['warehouse', 'movers', 'cleaning', 'event crew', 'harvest'];

function SearchInner() {
  const router = useRouter();
  const sp = useSearchParams();

  const [mode, setMode] = useState<'jobs' | 'people'>((sp.get('mode') as 'jobs' | 'people') ?? 'jobs');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [category, setCategory] = useState(sp.get('category') ?? '');
  const [payType, setPayType] = useState(sp.get('payType') ?? '');
  const [hiringNow, setHiringNow] = useState(sp.get('hiringNow') === '1');
  const [radiusKm, setRadiusKm] = useState(sp.get('radiusKm') ?? '');
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [people, setPeople] = useState<PublicProfile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  // URL as source of truth (shareable searches, §5.4)
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (mode !== 'jobs') params.set('mode', mode);
    if (category) params.set('category', category);
    if (payType) params.set('payType', payType);
    if (hiringNow) params.set('hiringNow', '1');
    if (radiusKm) params.set('radiusKm', radiusKm);
    router.replace(`/search${params.toString() ? `?${params}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, q, category, payType, hiringNow, radiusKm]);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem('wl_recent_searches') ?? '[]'));
    } catch { /* ignore */ }
  }, []);

  const run = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const pos = getPos();
      if (mode === 'jobs') {
        const res = await api.searchJobs({
          q: term || undefined,
          category: (category || undefined) as JobSummary['category'] | undefined,
          payType: (payType || undefined) as JobSummary['payType'] | undefined,
          hiringNow: hiringNow || undefined,
          lat: pos?.lat,
          lng: pos?.lng,
          radiusKm: radiusKm ? Number(radiusKm) : undefined,
          sort: 'recent',
          limit: 30,
        });
        setJobs(res.data);
        setPeople(null);
      } else {
        const res = await api.searchPeople({ q: term || undefined, lat: pos?.lat, lng: pos?.lng, radiusKm: radiusKm ? Number(radiusKm) : undefined });
        setPeople(res.data);
        setJobs(null);
      }
      if (term) {
        const next = [term, ...recent.filter((r) => r !== term)].slice(0, 5);
        setRecent(next);
        localStorage.setItem('wl_recent_searches', JSON.stringify(next));
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, category, payType, hiringNow, radiusKm, recent]);

  // Debounced type-ahead (§5.4)
  useEffect(() => {
    const id = setTimeout(() => void run(q), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, mode, category, payType, hiringNow, radiusKm]);

  return (
    <div className="p-4 pb-24">
      <div className="flex gap-2 mb-3">
        <Chip active={mode === 'jobs'} onClick={() => setMode('jobs')}>💼 Work</Chip>
        <Chip active={mode === 'people'} onClick={() => setMode('people')}>👥 People</Chip>
      </div>

      <input
        className="w-full h-12 rounded-2xl border border-line bg-card px-4 text-[15px]"
        placeholder={mode === 'jobs' ? 'Search jobs, skills, categories…' : 'Search people by name or skill…'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search query"
      />

      {mode === 'jobs' && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <Chip active={!category} onClick={() => setCategory('')}>All</Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? '' : c)}>
                {c.replaceAll('_', ' ').toLowerCase()}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <Chip active={hiringNow} onClick={() => setHiringNow(!hiringNow)}>⚡ hiring now</Chip>
            {['PER_HOUR', 'PER_DAY', 'FIXED_PER_WORK'].map((pt) => (
              <Chip key={pt} active={payType === pt} onClick={() => setPayType(payType === pt ? '' : pt)}>
                {pt === 'PER_HOUR' ? '/hour' : pt === 'PER_DAY' ? '/day' : 'fixed'}
              </Chip>
            ))}
            <select className="rounded-full border border-line bg-card text-sm px-3" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)} aria-label="Radius">
              <option value="">Any distance</option>
              <option value="2">2 km</option>
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
            </select>
          </div>
        </div>
      )}

      {!q && recent.length > 0 && (
        <section className="mt-4" aria-label="Recent searches">
          <p className="text-xs font-bold uppercase text-subtle mb-1.5">Recent</p>
          <div className="flex gap-2 flex-wrap">
            {recent.map((r) => (
              <Chip key={r} onClick={() => setQ(r)}>{r}</Chip>
            ))}
          </div>
        </section>
      )}

      {!q && (
        <section className="mt-4" aria-label="Trending">
          <p className="text-xs font-bold uppercase text-subtle mb-1.5">Trending</p>
          <div className="flex gap-2 flex-wrap">
            {TRENDING.map((tr) => (
              <Chip key={tr} onClick={() => setQ(tr)}>{tr}</Chip>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        )}

        {!loading && jobs && jobs.length === 0 && (
          <EmptyState icon="🔍" title="No jobs found" hint="Try fewer filters or a broader term — or check the trending searches above." />
        )}
        {!loading && people && people.length === 0 && (
          <EmptyState icon="🫥" title="No people found" hint="Try a different name or skill." />
        )}

        <div className="space-y-2">
          {jobs?.map((j) => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="block bg-card border border-line rounded-2xl p-3 active:scale-[.99] transition-transform">
              <p className="font-bold text-sm">{j.title}</p>
              <p className="text-primary font-extrabold text-sm mt-0.5">
                {formatMoney(j.payAmountMinor, j.currency)} <span className="text-xs text-subtle font-semibold">{PAY_TYPE_SUFFIX[j.payType]}</span>
              </p>
              <p className="text-xs text-subtle mt-1">
                {j.city ?? '—'} · starts {new Date(j.startAt).toLocaleDateString()} {j.distanceKm !== null && `· ${j.distanceKm} km`}
              </p>
            </Link>
          ))}
          {people?.map((p) => (
            <Link key={p.id} href={`/users/${p.id}`} className="flex items-center gap-3 bg-card border border-line rounded-2xl p-3">
              <Avatar src={p.avatarUrl} name={p.displayName} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">{p.displayName}</p>
                <p className="text-xs text-subtle truncate">{p.headline ?? p.skills.slice(0, 3).join(' · ')}</p>
              </div>
              <Stars value={p.ratingAvg} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function getPos(): { lat: number; lng: number } | null {
  try {
    const raw = localStorage.getItem('wl_position');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function SearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 m-4" />}>
      <SearchInner />
    </Suspense>
  );
}
