'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import type { FeedPost, JobSummary } from '@worklink/types';
import { formatMoney, PAY_TYPE_SUFFIX } from '@/lib/format';
import { Avatar, Stars } from './ui';
import { api } from '@/lib/api';

const CATEGORY_COVER: Record<string, { emoji: string; from: string; to: string }> = {
  CONSTRUCTION: { emoji: '🏗️', from: '#f59e0b', to: '#b45309' },
  WAREHOUSE: { emoji: '📦', from: '#38bdf8', to: '#0369a1' },
  DELIVERY: { emoji: '🛵', from: '#34d399', to: '#047857' },
  CLEANING: { emoji: '🧹', from: '#a5b4fc', to: '#4338ca' },
  AGRICULTURE: { emoji: '🌾', from: '#facc15', to: '#a16207' },
  EVENTS: { emoji: '🎪', from: '#f472b6', to: '#be185d' },
  MOVING_PACKING: { emoji: '🚚', from: '#fb923c', to: '#c2410c' },
  KITCHEN_HELP: { emoji: '🍳', from: '#f87171', to: '#991b1b' },
  GARDENING: { emoji: '🌱', from: '#4ade80', to: '#15803d' },
  SECURITY: { emoji: '🛡️', from: '#94a3b8', to: '#334155' },
  DRIVING: { emoji: '🚗', from: '#60a5fa', to: '#1d4ed8' },
  OTHER: { emoji: '🧰', from: '#a8a29e', to: '#57534e' },
};

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function JobCard({ post, index }: { post: FeedPost; index: number }) {
  const job = post.job;
  const [saved, setSaved] = useState(post.saved);
  const [applied, setApplied] = useState(post.applied);
  const [appliedBusy, setAppliedBusy] = useState(false);
  const [heart, setHeart] = useState(false);
  const lastTap = useRef(0);

  const cover = CATEGORY_COVER[job.category] ?? CATEGORY_COVER.OTHER!;

  async function toggleSave() {
    const next = !saved;
    setSaved(next); // optimistic
    setHeart(true);
    setTimeout(() => setHeart(false), 700);
    try {
      const res = await api.toggleSaveJob(job.id);
      setSaved(res.saved);
    } catch {
      setSaved(!next); // revert
    }
  }

  async function apply() {
    setAppliedBusy(true);
    try {
      await api.apply(job.id, { message: 'Hi! I am interested and available.' });
      setApplied(true);
    } catch {
      /* e.g. already applied */
      setApplied(true);
    } finally {
      setAppliedBusy(false);
    }
  }

  function onCardTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!saved) void toggleSave();
    }
    lastTap.current = now;
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '40px' }}
      transition={{ duration: 0.3, delay: Math.min(index, 3) * 0.04 }}
      className="bg-card border-b border-line"
      onPointerDown={onCardTap}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-3">
        <Link href={`/users/${job.employer.id}`} aria-label={`View ${job.employer.displayName}'s profile`}>
          <Avatar src={job.employer.avatarUrl} name={job.employer.displayName} size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate flex items-center gap-1">
            {job.employer.displayName}
            {job.employer.isVerified && (
              <span title="Verified" aria-label="Verified" className="text-accent text-xs">✔</span>
            )}
          </p>
          <p className="text-xs text-subtle flex items-center gap-1.5">
            <Stars value={job.employer.ratingAvg} />
            {job.city && <span>· {job.city}</span>}
            <span>· {relativeTime(job.createdAt)}</span>
          </p>
        </div>
        <Link href={`/jobs/${job.id}`} className="text-xs text-accent font-semibold shrink-0">View</Link>
      </div>

      {/* Media */}
      <Link href={`/jobs/${job.id}`} className="block relative aspect-[4/3] overflow-hidden" aria-label={job.title}>
        {job.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={job.imageUrl} alt={`Photo for ${job.title}`} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${cover.from}, ${cover.to})` }}
            role="img"
            aria-label={`${job.category.replace('_', ' ').toLowerCase()} job illustration`}
          >
            <span className="text-7xl drop-shadow" aria-hidden>{cover.emoji}</span>
          </div>
        )}
        <AnimateHeart show={heart} />
      </Link>

      {/* Actions */}
      <div className="flex items-center gap-4 px-3 pt-2.5 text-xl">
        <button aria-label={saved ? 'Remove from saved' : 'Save job'} aria-pressed={saved} onClick={toggleSave} className={saved ? 'text-danger' : ''}>
          {saved ? '♥' : '♡'}
        </button>
        <Link href={`/jobs/${job.id}/chat`} aria-label="Message employer" title="Chat">💬</Link>
        <button
          aria-label="Share job"
          onClick={async () => {
            const url = `${location.origin}/jobs/${job.id}`;
            if (navigator.share) await navigator.share({ title: job.title, url }).catch(() => undefined);
            else await navigator.clipboard.writeText(url).catch(() => undefined);
          }}
        >
          ↗
        </button>
        <div className="flex-1" />
        {applied ? (
          <span className="text-xs font-bold text-success uppercase tracking-wide">Applied ✓</span>
        ) : (
          <button
            onClick={apply}
            disabled={appliedBusy}
            className="bg-primary text-on-primary text-sm font-bold rounded-full px-4 py-1.5 disabled:opacity-60"
          >
            {appliedBusy ? '…' : 'Apply'}
          </button>
        )}
      </div>

      {/* Meta */}
      <div className="px-3 py-2.5">
        <Link href={`/jobs/${job.id}`}>
          <h3 className="font-bold text-[15px] leading-snug">{job.title}</h3>
        </Link>
        <p className="text-sm font-extrabold text-primary mt-0.5">
          {formatMoney(job.payAmountMinor, job.currency)}
          <span className="text-xs font-semibold text-subtle"> {PAY_TYPE_SUFFIX[job.payType]}</span>
          {job.negotiable && <span className="text-xs text-subtle"> · negotiable</span>}
        </p>
        <p className="text-xs text-subtle mt-0.5 flex flex-wrap gap-x-2">
          <span>📅 {new Date(job.startAt).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
          {job.distanceKm !== null && <span>📍 {job.distanceKm} km away</span>}
          <span>👥 {job.filledCount}/{job.workersNeeded} filled</span>
        </p>
      </div>
    </motion.article>
  );
}

function AnimateHeart({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <motion.div
      initial={{ scale: 0.4, opacity: 0.9 }}
      animate={{ scale: 1.6, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
      aria-hidden
    >
      <span className="text-8xl drop-shadow-lg">❤️</span>
    </motion.div>
  );
}

export type { JobSummary };
