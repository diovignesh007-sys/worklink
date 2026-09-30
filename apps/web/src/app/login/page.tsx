'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { api, setAccessToken } from '@/lib/api';
import { useSession } from '@/lib/store';
import { Button } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useSession((s) => s.setUser);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api.login({ identifier, password });
      setAccessToken(session.accessToken);
      setUser(session.user);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <h1 className="text-3xl font-black text-primary text-center mb-1">WorkLink</h1>
        <p className="text-center text-subtle text-sm mb-8">Find work. Hire help. Get paid.</p>

        <form onSubmit={submit} className="space-y-3">
          <input
            className="w-full h-12 rounded-xl border border-line bg-card px-4 text-[15px]"
            placeholder="Email or phone (+9198…)"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
          <input
            className="w-full h-12 rounded-xl border border-line bg-card px-4 text-[15px]"
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p role="alert" className="text-danger text-sm">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Log in'}
          </Button>
        </form>

        <div className="flex items-center justify-between mt-4 text-sm">
          <Link href="/forgot-password" className="text-accent">Forgot password?</Link>
          <Link href="/signup" className="text-accent font-semibold">Create account</Link>
        </div>

        <p className="text-xs text-subtle text-center mt-10">
          Demo seed account: <code>demo@worklink.app</code> / <code>Worklink1</code>
        </p>
      </motion.div>
    </main>
  );
}
