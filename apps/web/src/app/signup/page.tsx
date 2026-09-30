'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, setAccessToken } from '@/lib/api';
import { useSession } from '@/lib/store';
import { Button } from '@/components/ui';

export default function SignupPage() {
  const router = useRouter();
  const setUser = useSession((s) => s.setUser);
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [displayName, setDisplayName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const isEmail = identifier.includes('@');
      const body = isEmail ? { displayName, email: identifier, password } : { displayName, phone: identifier, password };
      const res = await api.signup(body);
      setChallengeId(res.challengeId);
      setDevCode(res.devCode ?? null);
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api.verifyOtp({ challengeId, code });
      setAccessToken(session.accessToken);
      setUser(session.user);
      router.push('/profile?welcome=1');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-primary text-center mb-8">Join WorkLink</h1>

        {step === 'form' ? (
          <form onSubmit={submit} className="space-y-3">
            <input className="w-full h-12 rounded-xl border border-line bg-card px-4 text-[15px]" placeholder="Full name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} />
            <input className="w-full h-12 rounded-xl border border-line bg-card px-4 text-[15px]" placeholder="Email or phone (+9198…)" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            <input className="w-full h-12 rounded-xl border border-line bg-card px-4 text-[15px]" placeholder="Password (8+ chars, mixed case)" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            {error && <p role="alert" className="text-danger text-sm">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
            <p className="text-sm text-center text-subtle">
              Already have an account? <Link href="/login" className="text-accent font-semibold">Log in</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-subtle">Enter the 6-digit code we sent to <b>{identifier}</b>. Valid for 10 minutes.</p>
            {devCode && (
              <p className="text-xs rounded-lg bg-line/50 p-2.5">
                Dev mode: code is <b className="tracking-widest">{devCode}</b> (with a real SMS/email driver this is delivered instead).
              </p>
            )}
            <input className="w-full h-14 rounded-xl border border-line bg-card px-4 text-2xl tracking-[0.5em] text-center" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            {error && <p role="alert" className="text-danger text-sm">{error}</p>}
            <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>Verify</Button>
            <button
              type="button"
              className="w-full text-sm text-accent"
              onClick={async () => {
                const res = await api.resendOtp({ challengeId });
                setChallengeId(res.challengeId);
                setDevCode(res.devCode ?? null);
              }}
            >
              Resend code
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
