'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg' }) {
  const base =
    'inline-flex items-center justify-center gap-2 font-semibold rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none';
  const variants = {
    primary: 'bg-primary text-on-primary hover:opacity-90',
    outline: 'border border-line bg-card hover:bg-line/40',
    ghost: 'hover:bg-line/40',
    danger: 'bg-danger text-white hover:opacity-90',
  };
  const sizes = { sm: 'text-xs px-3 h-8', md: 'text-sm px-4 h-10', lg: 'text-base px-6 h-12' };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Chip({ active, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors ${
        active ? 'bg-primary text-on-primary border-primary' : 'bg-card text-text border-line hover:bg-line/40'
      }`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Avatar({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${name}'s avatar`} width={size} height={size} className="rounded-full object-cover bg-line" style={{ width: size, height: size }} />
  ) : (
    <div
      aria-label={`${name}'s avatar`}
      className="rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || '?'}
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  if (value === null) return <span className="text-xs text-subtle">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${value} out of 5`}>
      <span aria-hidden className="text-amber-500" style={{ fontSize: size }}>
        ★
      </span>
      <span className="text-xs font-semibold">{value.toFixed(1)}</span>
    </span>
  );
}

export function Sheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Focus trap + Escape (a11y §6)
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && node) {
        const focusables = node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed z-50 bg-card rounded-t-2xl inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto p-4 pb-8 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[480px] sm:rounded-2xl sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {title && <h2 className="text-lg font-bold mb-3">{title}</h2>}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function EmptyState({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-2">
      <div className="text-4xl" aria-hidden>
        {icon}
      </div>
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-subtle max-w-xs">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function StatusChip({ status }: { status: string }) {
  const colors: Record<string, string> = {
    APPLIED: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    SHORTLISTED: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    ACCEPTED: 'bg-green-500/15 text-green-600 dark:text-green-400',
    REJECTED: 'bg-red-500/15 text-red-600 dark:text-red-400',
    WITHDRAWN: 'bg-gray-500/15 text-subtle',
    ONGOING: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    COMPLETED: 'bg-green-500/15 text-green-600 dark:text-green-400',
    PAID: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    SCHEDULED: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
    OPEN: 'bg-green-500/15 text-green-600 dark:text-green-400',
    IN_PROGRESS: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    CANCELLED: 'bg-red-500/15 text-red-600 dark:text-red-400',
    EXPIRED: 'bg-gray-500/15 text-subtle',
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[status] ?? 'bg-line'}`}>{status.replaceAll('_', ' ')}</span>;
}
