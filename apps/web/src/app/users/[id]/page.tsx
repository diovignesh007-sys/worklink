'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import type { PublicProfile, ReviewView } from '@worklink/types';
import { Avatar, Button, EmptyState, Sheet, Skeleton, Stars } from '@/components/ui';

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const [p, setP] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewView[]>([]);
  const [missing, setMissing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    api.getUser(params.id).then(setP).catch(() => setMissing(true));
    api.getUserReviews(params.id).then((r) => setReviews(r.data)).catch(() => undefined);
  }, [params.id]);

  if (missing) return <EmptyState icon="🫥" title="User not found" />;
  if (!p) return <div className="p-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-32" /></div>;

  return (
    <div className="pb-24">
      <div className="p-4 flex items-start gap-4">
        <Avatar src={p.avatarUrl} name={p.displayName} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black flex items-center gap-1">
            {p.displayName} {p.isVerified && <span className="text-accent text-sm">✔</span>}
          </h1>
          <p className="text-sm text-subtle">{p.headline ?? p.city ?? 'WorkLink member'}</p>
          <p className="text-xs text-subtle mt-1">Joined {new Date(p.memberSince).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 text-center px-4 gap-2">
        <Stat k="Rating" v={p.ratingAvg ? `${p.ratingAvg.toFixed(1)} ★` : '—'} />
        <Stat k="Reviews" v={String(p.ratingCount)} />
        <Stat k="Jobs done" v={String(p.completedJobs)} />
      </div>

      {p.bio && <p className="px-4 mt-4 text-[15px] whitespace-pre-line">{p.bio}</p>}

      {p.skills.length > 0 && (
        <section className="px-4 mt-4">
          <h2 className="text-sm font-bold uppercase text-subtle mb-2">Skills</h2>
          <div className="flex flex-wrap gap-2">
            {p.skills.map((s) => (
              <span key={s} className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-3 py-1">{s}</span>
            ))}
          </div>
        </section>
      )}

      {p.languages.length > 0 && (
        <section className="px-4 mt-4">
          <h2 className="text-sm font-bold uppercase text-subtle mb-1">Languages</h2>
          <p className="text-sm">{p.languages.join(', ')}</p>
        </section>
      )}

      <section className="px-4 mt-6">
        <h2 className="text-sm font-bold uppercase text-subtle mb-2">Reviews ({reviews.length})</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-subtle">No published reviews yet.</p>
        ) : (
          <ul className="space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="bg-card border border-line rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <Avatar src={r.author.avatarUrl} name={r.author.displayName} size={28} />
                  <span className="text-sm font-semibold">{r.author.displayName}</span>
                  <span className="text-amber-500 text-sm">{'★'.repeat(r.rating)}</span>
                  {r.publishedAt && <span className="text-[11px] text-subtle ml-auto">{new Date(r.publishedAt).toLocaleDateString()}</span>}
                </div>
                {r.comment && <p className="text-sm mt-1.5">{r.comment}</p>}
                {r.tags.length > 0 && (
                  <p className="text-[11px] text-primary mt-1">{r.tags.map((tg) => tg.replaceAll('_', ' ')).join(' · ')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed bottom-20 lg:bottom-6 inset-x-0 max-w-xl mx-auto px-4 z-20">
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setReportOpen(true)}>Report</Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              await api.block(p.id).catch(() => undefined);
              alert('User blocked');
            }}
          >
            Block
          </Button>
        </div>
      </div>

      <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Report user">
        <div className="space-y-3 text-sm">
          <p className="text-subtle">Tell us what&apos;s wrong and our team will review.</p>
          <Button variant="danger" className="w-full" onClick={async () => {
            await api.report({ targetType: 'USER', targetId: p.id, reason: 'OTHER', details: 'From profile' }).catch(() => undefined);
            setReportOpen(false);
          }}>
            Submit report
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-card border border-line rounded-2xl p-3">
      <p className="text-[10px] uppercase text-subtle">{k}</p>
      <p className="font-bold">{v}</p>
    </div>
  );
}
