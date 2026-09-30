'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/api';
import { createJobSchema } from '@worklink/types';
import type { JobCategory } from '@worklink/types';
import { Button, Chip } from '@/components/ui';

const CATEGORIES: { value: JobCategory; label: string; emoji: string }[] = [
  { value: 'CONSTRUCTION', label: 'Construction', emoji: '🏗️' },
  { value: 'WAREHOUSE', label: 'Warehouse', emoji: '📦' },
  { value: 'DELIVERY', label: 'Delivery', emoji: '🛵' },
  { value: 'CLEANING', label: 'Cleaning', emoji: '🧹' },
  { value: 'AGRICULTURE', label: 'Agriculture', emoji: '🌾' },
  { value: 'EVENTS', label: 'Events', emoji: '🎪' },
  { value: 'MOVING_PACKING', label: 'Moving & packing', emoji: '🚚' },
  { value: 'KITCHEN_HELP', label: 'Kitchen help', emoji: '🍳' },
  { value: 'GARDENING', label: 'Gardening', emoji: '🌱' },
  { value: 'SECURITY', label: 'Security', emoji: '🛡️' },
  { value: 'DRIVING', label: 'Driving', emoji: '🚗' },
  { value: 'OTHER', label: 'Other', emoji: '🧰' },
];

const STEPS = ['Basics', 'Schedule', 'Pay', 'Location', 'Photos', 'Contact', 'Review'] as const;

interface Draft {
  title: string;
  description: string;
  category: JobCategory | '';
  skillsRequired: string[];
  workersNeeded: number;
  startAt: string;
  reportingTime: string;
  durationDays: number | null;
  durationHours: number | null;
  payType: 'PER_HOUR' | 'PER_DAY' | 'FIXED_PER_WORK';
  payAmount: string;
  currency: string;
  negotiable: boolean;
  location: { lat: number; lng: number } | null;
  addressText: string;
  showApproximateLocation: boolean;
  imageUrls: string[];
  contactPhone: string;
  contactVisibility: 'PUBLIC' | 'APPLICANTS_ONLY' | 'PRIVATE';
}

const EMPTY_DRAFT: Draft = {
  title: '',
  description: '',
  category: '',
  skillsRequired: [],
  workersNeeded: 1,
  startAt: '',
  reportingTime: '08:00',
  durationDays: 1,
  durationHours: null,
  payType: 'PER_DAY',
  payAmount: '',
  currency: 'USD',
  negotiable: false,
  location: null,
  addressText: '',
  showApproximateLocation: true,
  imageUrls: [],
  contactPhone: '',
  contactVisibility: 'APPLICANTS_ONLY',
};

export default function CreateJobPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('wl_job_draft');
      if (saved) return { ...EMPTY_DRAFT, ...(JSON.parse(saved) as Draft) };
    }
    return EMPTY_DRAFT;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [imagesUploading, setImagesUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Autosave to localStorage (draft persists server-side as DRAFT on publish=false)
  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem('wl_job_draft', JSON.stringify(draft));
      setSavedAt(new Date());
    }, 800);
    return () => clearTimeout(id);
  }, [draft]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError('Geolocation is not supported on this device');
    navigator.geolocation.getCurrentPosition(
      (pos) => patch({ location: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      () => setError('Could not read your location — pick the pin manually'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function uploadImages(files: FileList) {
    setImagesUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files).slice(0, 5 - draft.imageUrls.length)) {
        if (file.size > 5 * 1024 * 1024) {
          setError(`${file.name} is over the 5 MB limit`);
          continue;
        }
        const presign = await api.uploadUrl({ filename: file.name, contentType: file.type, sizeBytes: file.size, purpose: 'JOB' });
        await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: presign.headers ? { ...presign.headers } : { 'Content-Type': file.type } });
        await api.confirmUpload(presign.objectKey);
        patch({ imageUrls: [...draft.imageUrls, presign.publicUrl] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setImagesUploading(false);
    }
  }

  function validateStep(i: number): string | null {
    if (i === 0) {
      if (draft.title.trim().length < 5) return 'Title must be at least 5 characters';
      if (draft.description.trim().length < 20) return 'Description must be at least 20 characters';
      if (!draft.category) return 'Pick a category';
      if (draft.workersNeeded < 1) return 'Need at least 1 worker';
    }
    if (i === 1 && !draft.startAt) return 'Pick a start date';
    if (i === 2) {
      if (!draft.payAmount || Number(draft.payAmount) <= 0) return 'Enter the pay amount';
      if (!/^[A-Z]{3}$/.test(draft.currency)) return 'Currency must be a 3-letter code (e.g. USD, INR)';
    }
    if (i === 3 && (!draft.location || draft.addressText.trim().length < 3)) return 'Set a location pin and address';
    return null;
  }

  function next() {
    const err = validateStep(step);
    if (err) return setError(err);
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  async function publish() {
    for (let i = 0; i < STEPS.length - 1; i++) {
      const err = validateStep(i);
      if (err) {
        setStep(i);
        return setError(err);
      }
    }
    setBusy(true);
    setError(null);
    try {
      const startIso = new Date(draft.startAt).toISOString();
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim(),
        category: draft.category as JobCategory,
        skillsRequired: draft.skillsRequired,
        workersNeeded: draft.workersNeeded,
        startAt: startIso,
        durationDays: draft.durationDays,
        durationHours: draft.durationHours,
        reportingTime: draft.reportingTime || null,
        recurring: false,
        payType: draft.payType,
        payAmountMinor: Math.round(Number(draft.payAmount) * 100),
        currency: draft.currency.toUpperCase(),
        negotiable: draft.negotiable,
        location: draft.location!,
        addressText: draft.addressText.trim(),
        showApproximateLocation: draft.showApproximateLocation,
        contactPhone: draft.contactPhone || null,
        contactVisibility: draft.contactVisibility,
        imageUrls: draft.imageUrls,
        publish: true,
      };
      // Shared zod schema — same validation the server runs (§5.6)
      const parsed = createJobSchema.safeParse(payload);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? 'Invalid form');
        return;
      }
      const job = await api.createJob(parsed.data);
      localStorage.removeItem('wl_job_draft');
      router.push(`/jobs/${job.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    setBusy(true);
    try {
      await api.createJob({
        title: draft.title.trim() || 'Untitled draft',
        description: draft.description.trim() || 'Draft in progress — details to follow.',
        category: (draft.category || 'OTHER') as JobCategory,
        skillsRequired: draft.skillsRequired,
        workersNeeded: draft.workersNeeded || 1,
        startAt: draft.startAt ? new Date(draft.startAt).toISOString() : new Date(Date.now() + 86400000).toISOString(),
        durationDays: draft.durationDays,
        durationHours: draft.durationHours,
        reportingTime: draft.reportingTime || null,
        recurring: false,
        payType: draft.payType,
        payAmountMinor: Math.round(Number(draft.payAmount || 0) * 100),
        currency: draft.currency.toUpperCase(),
        negotiable: draft.negotiable,
        location: draft.location ?? { lat: 0, lng: 0 },
        addressText: draft.addressText.trim() || 'To be set',
        showApproximateLocation: draft.showApproximateLocation,
        contactPhone: draft.contactPhone || null,
        contactVisibility: draft.contactVisibility,
        imageUrls: draft.imageUrls,
        publish: false,
      });
      localStorage.removeItem('wl_job_draft');
      router.push('/profile?tab=posts');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-xl font-black mb-1">Post a job</h1>
      <p className="text-xs text-subtle mb-3">
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
        {savedAt && <span className="ml-2">· draft saved {savedAt.toLocaleTimeString()}</span>}
      </p>
      <div className="flex gap-1 mb-5" aria-hidden>
        {STEPS.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-line'}`} />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }}>
          {step === 0 && (
            <div className="space-y-4">
              <Field label="Job title">
                <input className={inputCls} maxLength={120} placeholder="e.g. Warehouse loaders — weekend shift" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
              </Field>
              <Field label="Category">
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => patch({ category: c.value })}
                      className={`rounded-xl border p-2.5 text-xs font-semibold flex flex-col items-center gap-1 ${draft.category === c.value ? 'border-primary bg-primary/10 text-primary' : 'border-line bg-card'}`}
                    >
                      <span className="text-xl" aria-hidden>{c.emoji}</span>
                      {c.label}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Description (min 20 chars)">
                <textarea className={`${inputCls} h-28 py-3`} maxLength={4000} placeholder="What needs doing, for how long, what should workers bring…" value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
              </Field>
              <Field label="Workers needed">
                <input className={inputCls} type="number" min={1} max={100} value={draft.workersNeeded} onChange={(e) => patch({ workersNeeded: Math.max(1, Number(e.target.value)) })} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <Field label="Start date & time">
                <input className={inputCls} type="datetime-local" value={draft.startAt} onChange={(e) => patch({ startAt: e.target.value })} />
              </Field>
              <Field label="Reporting time">
                <input className={inputCls} type="time" value={draft.reportingTime} onChange={(e) => patch({ reportingTime: e.target.value })} />
              </Field>
              <Field label="Duration">
                <div className="flex gap-2">
                  <input className={inputCls} type="number" min={1} placeholder="days" value={draft.durationDays ?? ''} onChange={(e) => patch({ durationDays: e.target.value ? Number(e.target.value) : null, durationHours: null })} />
                  <input className={inputCls} type="number" min={1} placeholder="hours" value={draft.durationHours ?? ''} onChange={(e) => patch({ durationHours: e.target.value ? Number(e.target.value) : null, durationDays: null })} />
                </div>
              </Field>
              <p className="text-xs text-subtle">One-off job. Recurring schedules (e.g. every weekend) arrive in a later release.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field label="Pay type">
                <div className="flex gap-2">
                  {(['PER_HOUR', 'PER_DAY', 'FIXED_PER_WORK'] as const).map((pt) => (
                    <Chip key={pt} active={draft.payType === pt} onClick={() => patch({ payType: pt })}>
                      {pt === 'PER_HOUR' ? 'Per hour' : pt === 'PER_DAY' ? 'Per day' : 'Fixed'}
                    </Chip>
                  ))}
                </div>
              </Field>
              <Field label={`Amount (${draft.currency})`}>
                <input className={inputCls} type="number" min={0} step="0.01" placeholder="e.g. 1200" value={draft.payAmount} onChange={(e) => patch({ payAmount: e.target.value })} />
              </Field>
              <Field label="Currency (ISO 4217)">
                <input className={inputCls} maxLength={3} placeholder="USD" value={draft.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} />
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.negotiable} onChange={(e) => patch({ negotiable: e.target.checked })} />
                Rate is negotiable
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-line bg-card overflow-hidden">
                <MapPreview location={draft.location} onMove={(loc) => patch({ location: loc })} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={useMyLocation}>📍 Use my location</Button>
              </div>
              <Field label="Address text">
                <input className={inputCls} placeholder="Street, area, city" value={draft.addressText} onChange={(e) => patch({ addressText: e.target.value })} />
              </Field>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={draft.showApproximateLocation} onChange={(e) => patch({ showApproximateLocation: e.target.checked })} />
                <span>Show only an approximate area publicly; exact pin is revealed to accepted workers. <span className="text-subtle">(Recommended)</span></span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {draft.imageUrls.map((url, i) => (
                  <div key={url} className="relative w-20 h-20 rounded-xl overflow-hidden border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`Job photo ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      aria-label={`Remove photo ${i + 1}`}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 text-xs"
                      onClick={() => patch({ imageUrls: draft.imageUrls.filter((_, j) => j !== i) })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {draft.imageUrls.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center text-subtle text-xs"
                  >
                    <span className="text-2xl" aria-hidden>＋</span>
                    {imagesUploading ? 'Uploading…' : 'Add'}
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => e.target.files && uploadImages(e.target.files)} />
              <p className="text-xs text-subtle">Up to 5 photos, 5 MB each. Images are re-encoded to WebP server-side (EXIF/GPS stripped).</p>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <Field label="Contact phone (optional)">
                <input className={inputCls} placeholder="+919876543210" value={draft.contactPhone} onChange={(e) => patch({ contactPhone: e.target.value })} />
              </Field>
              <Field label="Who can see the contact details?">
                <div className="flex flex-col gap-2">
                  {(['PUBLIC', 'APPLICANTS_ONLY', 'PRIVATE'] as const).map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm border border-line rounded-xl p-3">
                      <input type="radio" name="cvis" checked={draft.contactVisibility === v} onChange={() => patch({ contactVisibility: v })} />
                      {v === 'PUBLIC' ? 'Anyone' : v === 'APPLICANTS_ONLY' ? 'Only people who applied (recommended)' : 'Nobody — chat only'}
                    </label>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-3 text-sm">
              <h2 className="font-bold text-base">Review your post</h2>
              <ReviewRow k="Title" v={draft.title} />
              <ReviewRow k="Category" v={draft.category} />
              <ReviewRow k="Workers" v={String(draft.workersNeeded)} />
              <ReviewRow k="Starts" v={draft.startAt ? new Date(draft.startAt).toLocaleString() : '—'} />
              <ReviewRow k="Pay" v={`${draft.payAmount} ${draft.currency} ${draft.payType === 'PER_HOUR' ? '/hour' : draft.payType === 'PER_DAY' ? '/day' : 'fixed'}`} />
              <ReviewRow k="Location" v={draft.addressText} />
              <ReviewRow k="Photos" v={String(draft.imageUrls.length)} />
              <ReviewRow k="Contact" v={draft.contactVisibility.replaceAll('_', ' ').toLowerCase()} />
              {error && <p role="alert" className="text-danger">{error}</p>}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {error && step < 6 && <p role="alert" className="text-danger text-sm mt-4">{error}</p>}

      <div className="fixed bottom-20 lg:bottom-6 inset-x-0 max-w-xl mx-auto px-4 z-20">
        <div className="bg-card/95 backdrop-blur border border-line rounded-full shadow-lg p-2 flex gap-2">
          {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>}
          <div className="flex-1" />
          <Button variant="ghost" onClick={saveDraft} disabled={busy}>Save draft</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Next</Button>
          ) : (
            <Button onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</Button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full h-12 rounded-xl border border-line bg-bg px-4 text-[15px]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function ReviewRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line/60 pb-2">
      <span className="text-subtle shrink-0">{k}</span>
      <span className="font-semibold text-right">{v || '—'}</span>
    </div>
  );
}

/**
 * Map preview — OpenStreetMap embed (no API key needed) with a click-to-move
 * pin. When MAP_PROVIDER=google, swap in the Maps JS API behind MapProvider.
 */
function MapPreview({ location, onMove }: { location: { lat: number; lng: number } | null; onMove: (loc: { lat: number; lng: number }) => void }) {
  const [center, setCenter] = useState(location ?? { lat: 19.076, lng: 72.8777 });
  if (!location) {
    return (
      <div className="aspect-[4/3] flex flex-col items-center justify-center gap-2 text-subtle text-sm p-4 text-center">
        <span className="text-4xl" aria-hidden>🗺️</span>
        No pin set yet — use &ldquo;Use my location&rdquo; or tap the map after enabling it below.
        <iframe
          title="Pick a location on the map"
          className="w-full h-full min-h-56 border-0"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${center.lng - 0.05}%2C${center.lat - 0.05}%2C${center.lng + 0.05}%2C${center.lat + 0.05}&layer=mapnik&marker=${center.lat}%2C${center.lng}`}
        />
        <MapClickHelper onPick={onMove} />
      </div>
    );
  }
  return (
    <div className="relative aspect-[4/3]">
      <iframe
        title="Job location map"
        className="w-full h-full border-0"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${location.lng - 0.02}%2C${location.lat - 0.02}%2C${location.lng + 0.02}%2C${location.lat + 0.02}&layer=mapnik&marker=${location.lat}%2C${location.lng}`}
      />
      <MapClickHelper onPick={onPickProxy(onMove)} />
    </div>
  );
}

function onPickProxy(onMove: (loc: { lat: number; lng: number }) => void) {
  return (loc: { lat: number; lng: number }) => onMove(loc);
}

function MapClickHelper({ onPick }: { onPick: (loc: { lat: number; lng: number }) => void }) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        const lat = prompt('Latitude', '19.1136');
        const lng = prompt('Longitude', '72.8697');
        if (lat && lng) onPick({ lat: Number(lat), lng: Number(lng) });
      }}
      className="text-xs text-accent underline"
    >
      Set exact pin coordinates
    </a>
  );
}
