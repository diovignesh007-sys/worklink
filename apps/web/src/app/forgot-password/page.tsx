'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-black text-center mb-6">Reset your password</h1>
        {done ? (
          <div className="text-center space-y-4">
            <p className="text-success font-semibold">Password updated. All other sessions were signed out.</p>
            <Link href="/login" className="block"><Button className="w-full">Back to login</Button></Link>
          </div>
        ) : step === 1 ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                const res = await api.forgotPassword({ identifier });
                setChallengeId(res.challengeId);
                setDevCode(res.devCode ?? null);
                setStep(2);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Something went wrong');
              } finally {
                setBusy(false);
              }
            }}
          >
            <p className="text-sm text-subtle">We&apos;ll send a 6-digit code to your email or phone.</p>
            <input className="w-full h-12 rounded-xl border border-line bg-card px-4" placeholder="Email or phone" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            {error && <p role="alert" className="text-danger text-sm">{error}</p>}
            <Button className="w-full" size="lg" disabled={busy}>{busy ? 'Sending…' : 'Send code'}</Button>
            {devCode && <p className="text-xs text-subtle">Dev code: {devCode}</p>}
          </form>
        ) : step === 2 ? (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await api.verifyOtp({ challengeId, code });
                setStep(3);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Invalid code');
              } finally {
                setBusy(false);
              }
            }}
          >
            <input className="w-full h-14 rounded-xl border border-line bg-card px-4 text-2xl tracking-[0.5em] text-center" inputMode="numeric" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required />
            {error && <p role="alert" className="text-danger text-sm">{error}</p>}
            <Button className="w-full" size="lg" disabled={busy}>Verify code</Button>
          </form>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await api.resetPassword({ challengeId, code, newPassword });
                setDone(true);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Reset failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <input className="w-full h-12 rounded-xl border border-line bg-card px-4" placeholder="New password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
            {error && <p role="alert" className="text-danger text-sm">{error}</p>}
            <Button className="w-full" size="lg" disabled={busy}>Set new password</Button>
          </form>
        )}
        <p className="text-sm text-center mt-6"><Link href="/login" className="text-accent">Back to login</Link></p>
      </div>
    </main>
  );
}
