'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { AssignmentView, JobSummary, WorkerApplicationView, ApplicationView, ReviewTag } from '@worklink/types';
import { formatMoney, PAY_TYPE_SUFFIX } from '@/lib/format';
import { REVIEW_TAGS } from '@worklink/types';
import { Avatar, Button, Chip, EmptyState, Sheet, Skeleton, StatusChip, Stars } from '@/components/ui';
import { useSession } from '@/lib/store';

type Tab = 'applied' | 'ongoing' | 'history' | 'posts';

export default function WorkPage() {
  const user = useSession((s) => s.user);
  const [tab, setTab] = useState<Tab>('applied');
  const [applications, setApplications] = useState<WorkerApplicationView[] | null>(null);
  const [assignments, setAssignments] = useState<AssignmentView[] | null>(null);
  const [posts, setPosts] = useState<JobSummary[] | null>(null);
  const [applicantsFor, setApplicantsFor] = useState<{ job: JobSummary; list: ApplicationView[] } | null>(null);
  const [reviewFor, setReviewFor] = useState<AssignmentView | null>(null);

  const load = useCallback(async () => {
    const [apps, asg, myJobs] = await Promise.all([
      api.myApplications().catch(() => []),
      api.myAssignments().catch(() => []),
      api.myPosts().then((r) => r.data).catch(() => []),
    ]);
    setApplications(apps);
    setAssignments(asg);
    setPosts(myJobs as JobSummary[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <div className="p-6">
        <EmptyState icon="🔐" title="Log in to see your work" hint="Your applications, assignments and posts live here." />
        <div className="flex justify-center"><Link href="/login"><Button>Log in</Button></Link></div>
      </div>
    );
  }

  const ongoing = (assignments ?? []).filter((a) => ['SCHEDULED', 'ONGOING', 'DISPUTED'].includes(a.status));
  const history = (assignments ?? []).filter((a) => ['COMPLETED', 'PAID', 'CANCELLED'].includes(a.status));

  return (
    <div className="pb-24">
      <div role="tablist" aria-label="Work sections" className="flex gap-2 overflow-x-auto no-scrollbar p-4 pb-2 sticky top-14 bg-bg/95 backdrop-blur z-10">
        <Chip active={tab === 'applied'} onClick={() => setTab('applied')}>Applied</Chip>
        <Chip active={tab === 'ongoing'} onClick={() => setTab('ongoing')}>Ongoing</Chip>
        <Chip active={tab === 'history'} onClick={() => setTab('history')}>History</Chip>
        <Chip active={tab === 'posts'} onClick={() => setTab('posts')}>My posts</Chip>
      </div>

      {tab === 'applied' && (
        <div className="p-4 space-y-2">
          {applications === null ? (
            <Skeleton className="h-24" />
          ) : applications.length === 0 ? (
            <EmptyState icon="📭" title="No applications yet" hint="Apply from the home feed — saved jobs keep here too." />
          ) : (
            applications.map((a) => (
              <div key={a.id} className="bg-card border border-line rounded-2xl p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/jobs/${a.jobId}`} className="font-semibold text-sm truncate block">{a.jobTitle}</Link>
                  <p className="text-xs text-subtle">
                    {formatMoney(a.jobPayAmountMinor, a.currency)} {PAY_TYPE_SUFFIX[a.jobPayType]} · starts {new Date(a.jobStartAt).toLocaleDateString()}
                  </p>
                </div>
                <StatusChip status={a.status} />
                {['APPLIED', 'SHORTLISTED'].includes(a.status) && (
                  <Button size="sm" variant="ghost" onClick={async () => { await api.applicationAction(a.id, 'WITHDRAW'); void load(); }}>
                    Withdraw
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'ongoing' && (
        <div className="p-4 space-y-3">
          {assignments === null ? (
            <Skeleton className="h-24" />
          ) : ongoing.length === 0 ? (
            <EmptyState icon="🧰" title="Nothing in progress" hint="Accepted applications appear here as assignments." />
          ) : (
            ongoing.map((a) => <AssignmentCard key={a.id} a={a} onChanged={load} onReview={() => setReviewFor(a)} />)
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="p-4 space-y-3">
          {assignments === null ? (
            <Skeleton className="h-24" />
          ) : history.length === 0 ? (
            <EmptyState icon="📚" title="No history yet" />
          ) : (
            history.map((a) => <AssignmentCard key={a.id} a={a} onChanged={load} onReview={() => setReviewFor(a)} />)
          )}
        </div>
      )}

      {tab === 'posts' && (
        <div className="p-4 space-y-2">
          {posts === null ? (
            <Skeleton className="h-24" />
          ) : posts.length === 0 ? (
            <EmptyState icon="📌" title="You haven't posted any jobs" hint="Tap ➕ to create your first post." />
          ) : (
            posts.map((j) => (
              <div key={j.id} className="bg-card border border-line rounded-2xl p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/jobs/${j.id}`} className="font-semibold text-sm truncate block">{j.title}</Link>
                  <p className="text-xs text-subtle">{j.filledCount}/{j.workersNeeded} filled · {j.status}</p>
                </div>
                <Button size="sm" variant="outline" onClick={async () => {
                  const res = await api.jobApplications(j.id);
                  setApplicantsFor({ job: j, list: res.data });
                }}>
                  Applicants
                </Button>
                {j.status === 'OPEN' && (
                  <Button size="sm" variant="ghost" onClick={async () => { await api.closeJob(j.id); void load(); }}>Close</Button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Applicants sheet (employer side §5.5) */}
      <Sheet open={applicantsFor !== null} onClose={() => setApplicantsFor(null)} title={applicantsFor ? `Applicants — ${applicantsFor.job.title}` : ''}>
        <div className="space-y-3">
          {applicantsFor?.list.length === 0 && <p className="text-sm text-subtle">No applications yet. Share your post to reach more people.</p>}
          {applicantsFor?.list.map((app) => (
            <div key={app.id} className="border border-line rounded-2xl p-3">
              <div className="flex items-center gap-3">
                <Avatar src={app.worker.avatarUrl} name={app.worker.displayName} />
                <div className="min-w-0 flex-1">
                  <Link href={`/users/${app.worker.id}`} className="font-semibold text-sm">{app.worker.displayName}</Link>
                  <p className="text-xs text-subtle"><Stars value={app.worker.ratingAvg} /> · {app.worker.skills.slice(0, 3).join(', ')}</p>
                </div>
                <StatusChip status={app.status} />
              </div>
              {app.message && <p className="text-sm mt-2 text-text/90">“{app.message}”</p>}
              <div className="flex gap-2 mt-2">
                {['APPLIED', 'SHORTLISTED'].includes(app.status) && (
                  <>
                    <Button size="sm" variant="outline" onClick={async () => { await api.applicationAction(app.id, 'SHORTLIST'); setApplicantsFor({ ...applicantsFor, list: await refreshApplicants(applicantsFor.job.id) }); }}>Shortlist</Button>
                    <Button size="sm" onClick={async () => { await api.applicationAction(app.id, 'ACCEPT'); setApplicantsFor({ ...applicantsFor, list: await refreshApplicants(applicantsFor.job.id) }); void load(); }}>Accept</Button>
                    <Button size="sm" variant="ghost" onClick={async () => { await api.applicationAction(app.id, 'REJECT'); setApplicantsFor({ ...applicantsFor, list: await refreshApplicants(applicantsFor.job.id) }); }}>Reject</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      <ReviewSheet a={reviewFor} onClose={() => setReviewFor(null)} onDone={load} />
    </div>
  );
}

async function refreshApplicants(jobId: string): Promise<ApplicationView[]> {
  return (await api.jobApplications(jobId)).data;
}

function AssignmentCard({ a, onChanged, onReview }: { a: AssignmentView; onChanged: () => void; onReview: () => void }) {
  const [logOpen, setLogOpen] = useState(false);
  const isWorker = a.viewerRole === 'WORKER';
  const totalApproved = a.logs.filter((l) => l.status === 'APPROVED').reduce((s, l) => s + l.hoursOrDays, 0);

  return (
    <div className="bg-card border border-line rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm truncate">{a.jobTitle}</p>
          <p className="text-xs text-subtle mt-0.5">
            {formatMoney(a.agreedRateMinor, a.currency)} {PAY_TYPE_SUFFIX[a.payType]} · {isWorker ? 'for you' : `worker: ${a.worker.displayName}`}
          </p>
        </div>
        <StatusChip status={a.status} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="bg-bg rounded-xl p-2">
          <p className="text-[10px] text-subtle uppercase">Logged</p>
          <p className="font-bold text-sm">{totalApproved}</p>
        </div>
        <div className="bg-bg rounded-xl p-2">
          <p className="text-[10px] text-subtle uppercase">Payment</p>
          <p className="font-bold text-sm">{a.paymentStatus ?? '—'}</p>
        </div>
        <div className="bg-bg rounded-xl p-2">
          <p className="text-[10px] text-subtle uppercase">Completed</p>
          <p className="font-bold text-sm">{a.completedAt ? new Date(a.completedAt).toLocaleDateString() : '—'}</p>
        </div>
      </div>

      {a.logs.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {a.logs.slice(0, 5).map((l) => (
            <li key={l.id} className="flex items-center justify-between bg-bg rounded-lg px-2.5 py-1.5">
              <span>{l.date} — {l.hoursOrDays} {l.note ? `· ${l.note}` : ''}</span>
              <span className="flex items-center gap-2">
                <StatusChip status={l.status} />
                {!isWorker && l.status === 'PENDING' && (
                  <>
                    <button className="text-success font-bold" onClick={async () => { await api.decideLog(a.id, l.id, 'APPROVE'); onChanged(); }}>✓</button>
                    <button className="text-danger font-bold" onClick={async () => { await api.decideLog(a.id, l.id, 'REJECT'); onChanged(); }}>×</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {isWorker && ['ONGOING', 'SCHEDULED'].includes(a.status) && (
          <>
            <Button size="sm" variant="outline" onClick={() => setLogOpen(true)}>Log time</Button>
            <Button size="sm" onClick={async () => { await api.completeAssignment(a.id); onChanged(); }}>Mark complete</Button>
          </>
        )}
        {!isWorker && ['ONGOING', 'SCHEDULED'].includes(a.status) && (
          <Button size="sm" variant="outline" onClick={async () => { await api.completeAssignment(a.id); onChanged(); }}>Confirm completion</Button>
        )}
        {['COMPLETED', 'PAID'].includes(a.status) && a.review && !a.review.byViewer && (
          <Button size="sm" onClick={onReview}>★ Leave a review</Button>
        )}
        {['COMPLETED', 'PAID'].includes(a.status) && a.review?.byViewer && (
          <span className="text-xs text-subtle self-center">Review submitted ✓ {a.review.byOther ? '' : '· waiting for the other side (reveals mutually or after 7 days)'}</span>
        )}
      </div>

      <LogSheet open={logOpen} onClose={() => setLogOpen(false)} assignmentId={a.id} onDone={onChanged} />
    </div>
  );
}

function LogSheet({ open, onClose, assignmentId, onDone }: { open: boolean; onClose: () => void; assignmentId: string; onDone: () => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Log day / hours">
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.submitLog(assignmentId, { date, hoursOrDays: Number(amount), note: note || undefined });
            onDone();
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <input type="date" className="w-full h-11 rounded-xl border border-line bg-bg px-3" value={date} onChange={(e) => setDate(e.target.value)} required />
        <input type="number" min={0.5} step={0.5} className="w-full h-11 rounded-xl border border-line bg-bg px-3" placeholder="Hours or days" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        <input className="w-full h-11 rounded-xl border border-line bg-bg px-3" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Submitting…' : 'Submit log'}</Button>
        <p className="text-xs text-subtle">The employer approves each log. Logs feed the final payment.</p>
      </form>
    </Sheet>
  );
}

function ReviewSheet({ a, onClose, onDone }: { a: AssignmentView | null; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [busy, setBusy] = useState(false);

  return (
    <Sheet open={a !== null} onClose={onClose} title="Rate this work">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!a) return;
          setBusy(true);
          try {
            await api.submitReview(a.id, { rating, comment: comment || undefined, tags });
            onDone();
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex justify-center gap-1.5" role="radiogroup" aria-label="Star rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className={`text-4xl ${n <= rating ? 'text-amber-500' : 'text-line'}`}>
              ★
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {REVIEW_TAGS.map((tg) => (
            <Chip key={tg} active={tags.includes(tg)} onClick={() => setTags((prev) => (prev.includes(tg) ? prev.filter((x) => x !== tg) : prev.concat(tg)))}>
              {tg.replaceAll('_', ' ')}
            </Chip>
          ))}
        </div>
        <textarea className="w-full rounded-xl border border-line bg-bg p-3 text-sm" rows={3} placeholder="Share how it went (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Sending…' : 'Submit review'}</Button>
        <p className="text-xs text-subtle">Reviews are double-blind: both sides submit before anything is published (or 7 days pass).</p>
      </form>
    </Sheet>
  );
}
