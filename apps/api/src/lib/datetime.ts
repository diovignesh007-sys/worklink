export const DAY_MS = 24 * 3600 * 1000;

export function isoNow(): string {
  return new Date().toISOString();
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** End-of-day N days from start (job expiry default: 14 days). */
export function expiresAtFromStart(startAt: Date, defaultDays = 14): Date {
  return addDays(startAt, defaultDays);
}

/** Human relative time ("3h ago") — server-side fallback; client re-renders. */
export function relativeTime(from: Date, now = new Date()): string {
  const diff = now.getTime() - from.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return from.toISOString().slice(0, 10);
}

export function daysUntil(target: Date, now = new Date()): number {
  return Math.ceil((target.getTime() - now.getTime()) / DAY_MS);
}
