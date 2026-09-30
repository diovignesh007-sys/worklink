'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/store';
import type { SkillEntry } from '@worklink/types';
import { Avatar, Button, Chip, EmptyState } from '@/components/ui';

export default function ProfilePage() {
  const { user, refresh } = useSession();
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.profile.displayName);
      setHeadline(user.profile.headline ?? '');
      setBio(user.profile.bio ?? '');
      setSkills(user.profile.skills);
      setAvailable(user.profile.isAvailableNow);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="p-6">
        <EmptyState icon="👤" title="You're not logged in" />
        <div className="flex justify-center gap-2">
          <Link href="/login"><Button>Log in</Button></Link>
          <Link href="/signup"><Button variant="outline">Sign up</Button></Link>
        </div>
      </div>
    );
  }

  async function uploadAvatar(file: File) {
    if (file.size > 5 * 1024 * 1024) return alert('Max 5 MB');
    try {
      const presign = await api.uploadUrl({ filename: file.name, contentType: file.type, sizeBytes: file.size, purpose: 'AVATAR' });
      await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: presign.headers ?? { 'Content-Type': file.type } });
      await api.confirmUpload(presign.objectKey);
      await api.updateMe({ avatarUrl: presign.publicUrl });
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  async function save() {
    setBusy(true);
    try {
      await api.updateMe({ displayName, headline, bio, skills, isAvailableNow: available });
      await refresh();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  const p = user.profile;

  return (
    <div className="pb-24">
      <div className="p-4 flex items-start gap-4">
        <button onClick={() => fileRef.current?.click()} aria-label="Change profile photo" className="relative">
          <Avatar src={p.avatarUrl} name={p.displayName} size={72} />
          <span className="absolute -bottom-1 -right-1 bg-primary text-on-primary rounded-full w-6 h-6 text-xs flex items-center justify-center">✎</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-black">{p.displayName}</h1>
          <p className="text-sm text-subtle">{p.headline ?? 'Add a headline'}</p>
          <p className="text-xs text-subtle mt-1">
            {p.homeCity ?? 'Set your city'} · {p.availability.toLowerCase().replaceAll('_', ' ')}
          </p>
        </div>
        <Button size="sm" variant={editing ? 'outline' : 'primary'} onClick={() => setEditing(!editing)}>
          {editing ? 'Cancel' : 'Edit'}
        </Button>
      </div>

      {editing ? (
        <div className="px-4 space-y-3">
          <input className="w-full h-11 rounded-xl border border-line bg-card px-3" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
          <input className="w-full h-11 rounded-xl border border-line bg-card px-3" value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (e.g. Skilled all-rounder)" />
          <textarea className="w-full rounded-xl border border-line bg-card p-3" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio" />
          <div>
            <p className="text-sm font-semibold mb-1.5">Skills</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {skills.map((s, i) => (
                <Chip key={`${s.name}-${i}`} active onClick={() => setSkills(skills.filter((_, j) => j !== i))}>
                  {s.name} · {s.level.toLowerCase()} ×
                </Chip>
              ))}
            </div>
            <input
              id="new-skill"
              className="w-full h-10 rounded-xl border border-line bg-card px-3 text-sm"
              placeholder="Type a skill and press Enter"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) setSkills(skills.concat({ name: v, level: 'INTERMEDIATE' }));
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
            Available for work right now
          </label>
          <Button onClick={save} disabled={busy} className="w-full">{busy ? 'Saving…' : 'Save profile'}</Button>
        </div>
      ) : (
        <>
          {p.bio && <p className="px-4 text-[15px] whitespace-pre-line">{p.bio}</p>}
          {p.skills.length > 0 && (
            <div className="px-4 mt-3 flex flex-wrap gap-2">
              {p.skills.map((s, i) => (
                <span key={i} className="rounded-full bg-primary/10 text-primary text-xs font-semibold px-3 py-1">
                  {s.name} · {s.level.toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="px-4 mt-6 grid grid-cols-2 gap-2">
        <Link href="/work?tab=posts" className="bg-card border border-line rounded-2xl p-3 text-sm font-semibold">📌 My posts</Link>
        <Link href="/work" className="bg-card border border-line rounded-2xl p-3 text-sm font-semibold">🧰 My work</Link>
        <Link href="/settings" className="bg-card border border-line rounded-2xl p-3 text-sm font-semibold">⚙️ Settings</Link>
        <Link href="/earnings" className="bg-card border border-line rounded-2xl p-3 text-sm font-semibold">💰 Earnings</Link>
      </div>
    </div>
  );
}
