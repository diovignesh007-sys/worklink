'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { formatMoney, PAY_TYPE_SUFFIX } from '@/lib/format';
import type { JobDetail } from '@worklink/types';
import { Avatar, Button, Chip, EmptyState, Sheet, Skeleton, Stars } from '@/components/ui';
import { useSession } from '@/lib/store';
import { relativeTime } from '@/components/job-card';

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const [job, setJob] = useState<JobDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getJob(params.id)
      .then(setJob)
      .catch(() => setNotFound(true));
  }, [params.id]);

  if (notFound) return <EmptyState icon="🕳️" title="Job not found" hint="It may have been closed or expired." />;
  if (!job) {
    return (
      <div className="p-3 space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="aspect-[4/3]" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const rel = job.viewerRelationship;
  const isOwner = rel?.isOwner ?? false;

  async function apply() {
    setBusy(true);
    try {
      await api.apply(job!.id, { message: 'Hi! I am interested and available.' });
      const fresh = await api.getJob(job!.id);
      setJob(fresh);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    const res = await api.toggleSaveJob(job!.id);
    const fresh = await api.getJob(job!.id);
    setJob(fresh);
    void res;
  }

  return (
    <div className="pb-8">
      {job.images.length > 0 ? (
        <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory">
          {job.images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={img.url} src={img.url} alt={`Job photo`} className="w-full shrink-0 snap-center aspect-[4/3] object-cover" />
          ))}
        </div>
      ) : (
        <div className="aspect-[4/3] flex items-center justify-center bg-line/40 text-7xl" aria-hidden>
          🧰
        </div>
      )}

      <div className="p-4 space-y-4">
        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-black leading-tight">{job.title}</h1>
            {job.status !== 'OPEN' && (
              <span className="text-xs font-bold uppercase text-subtle border border-line rounded-full px-2 py-1">{job.status}</span>
            )}
          </div>
          <p className="text-2xl font-black text-primary mt-1">
            {formatMoney(job.payAmountMinor, job.currency)}
            <span className="text-sm text-subtle font-semibold"> {PAY_TYPE_SUFFIX[job.payType]}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 bg-card border border-line rounded-2xl p-3">
          <Avatar src={job.employer.avatarUrl} name={job.employer.displayName} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm">{job.employer.displayName} {job.employer.isVerified && <span className="text-accent">✔</span>}</p>
            <p className="text-xs text-subtle flex gap-2 items-center">
              <Stars value={job.employer.ratingAvg} /> · posted {relativeTime(job.createdAt)}
            </p>
          </div>
          {!isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!user) return router.push('/login');
                try {
                  const conv = await api.createConversation(job.id, job.employer.id);
                  router.push(`/chat/${conv.id}`);
                } catch {
                  /* blocked or offline */
                }
              }}
            >
              Chat
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Detail label="Starts" value={new Date(job.startAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} />
          {job.reportingTime && <Detail label="Reporting time" value={job.reportingTime ?? ''} />}
          {job.durationDays && <Detail label="Duration" value={`${job.durationDays} day${job.durationDays > 1 ? 's' : ''}`} />}
          <Detail label="Positions" value={`${job.filledCount} of ${job.workersNeeded} filled`} />
          <Detail label="Location" value={job.addressText ?? ''} />
          {job.distanceKm !== null && <Detail label="Distance" value={`${job.distanceKm} km away`} />}
        </dl>

        <section aria-label="Job description">
          <h2 className="font-bold mb-1">About the work</h2>
          <p className="text-[15px] text-text/90 whitespace-pre-line">{job.description}</p>
        </section>

        {job.skillsRequired.length > 0 && (
          <section aria-label="Skills needed">
            <h2 className="font-bold mb-2">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {job.skillsRequired.map((s) => (
                <Chip key={s} active>{s}</Chip>
              ))}
            </div>
          </section>
        )}

        {/* Sticky action row */}
        <div className="fixed bottom-20 lg:bottom-6 inset-x-0 max-w-xl mx-auto px-4 z-20">
          <div className="bg-card/95 backdrop-blur border border-line rounded-full shadow-lg p-2 flex items-center gap-2">
            <Button variant="outline" onClick={save} aria-pressed={rel?.saved} className="!px-4">
              {rel?.saved ? '♥' : '♡'}
            </Button>
            <Button variant="outline" onClick={() => setReportOpen(true)} className="!px-4" aria-label="Report job">⚑</Button>
            <Button
              variant="outline"
              onClick={async () => {
                const url = `${location.origin}/jobs/${job.id}`;
                if (navigator.share) await navigator.share({ title: job.title, url }).catch(() => undefined);
                else await navigator.clipboard.writeText(url);
              }}
              className="!px-4"
              aria-label="Share job"
            >
              ↗
            </Button>
            <div className="flex-1" />
            {isOwner ? (
              <Button onClick={() => router.push(`/jobs/${job.id}/applicants`)}>View applicants</Button>
            ) : rel?.hasApplied ? (
              <Button variant="outline" disabled>Applied · {rel.applicationStatus}</Button>
            ) : job.status === 'OPEN' ? (
              <Button onClick={apply} disabled={busy}>{busy ? '…' : 'Apply for this job'}</Button>
            ) : (
              <Button variant="outline" disabled>Not accepting applications</Button>
            )}
          </div>
        </div>

        <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} targetType="JOB" targetId={job.id} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-line rounded-xl p-3">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="font-semibold mt-0.5">{value}</dd>
    </div>
  );
}

export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'USER' | 'JOB' | 'MESSAGE' | 'CONVERSATION';
  targetId: string;
}) {
  const [reason, setReason] = useState('SCAM');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title={sent ? 'Thank you' : 'Report'}>
      {sent ? (
        <p className="text-sm text-subtle py-4">Our moderation team will review this. You can also block the user from their profile.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.report({ targetType, targetId, reason, details }).catch(() => undefined);
            setSent(true);
          }}
        >
          <p className="text-sm text-subtle">
            Scams exist everywhere. WorkLink will <b>never</b> ask workers to pay to get a job.
          </p>
          <select className="w-full h-11 rounded-xl border border-line bg-card px-3" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
            {['SPAM', 'SCAM', 'FAKE_JOB', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <textarea className="w-full rounded-xl border border-line bg-card p-3 text-sm" rows={3} placeholder="What happened? (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <Button type="submit" variant="danger" className="w-full">Submit report</Button>
        </form>
      )}
    </Sheet>
  );
}
