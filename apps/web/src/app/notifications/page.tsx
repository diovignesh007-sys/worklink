'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { NotificationView } from '@worklink/types';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useUI } from '@/lib/store';
import { relativeTime } from '@/components/job-card';

const ICONS: Record<string, string> = {
  NEW_MATCHING_JOB: '💼',
  NEW_APPLICATION: '📨',
  APPLICATION_SHORTLISTED: '⭐',
  APPLICATION_ACCEPTED: '🎉',
  APPLICATION_REJECTED: 'DECLINED',
  ASSIGNMENT_STARTING_TOMORROW: '⏰',
  WORK_MARKED_COMPLETE: '✅',
  REVIEW_RECEIVED: '★',
  PAYMENT_RECEIVED: '💸',
  MESSAGE_NEW: '💬',
  SYSTEM: '🔔',
};

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const setUnread = useUI((s) => s.setUnreadNotifications);

  useEffect(() => {
    api.notifications()
      .then((res) => {
        setItems(res.data);
        setUnread(0);
        void api.markNotificationsRead(res.data.filter((n) => !n.readAt).map((n) => n.id)).catch(() => undefined);
      })
      .catch(() => setItems([]));
  }, [setUnread]);

  return (
    <div className="pb-24">
      <div className="flex items-center justify-between p-4 pb-2">
        <h1 className="font-black text-lg">Notifications</h1>
        {items && items.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => void api.markNotificationsRead(items.map((n) => n.id))}>
            Mark all read
          </Button>
        )}
      </div>

      {items === null ? (
        <div className="p-4 space-y-2"><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-14" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon="🔔" title="All quiet" hint="Matching jobs and updates about your posts will land here." />
      ) : (
        <ul>
          {items.map((n) => (
            <li key={n.id}>
              <Link
                href={n.linkPath ?? '#'}
                className={`flex items-center gap-3 px-4 py-3 border-b border-line ${!n.readAt ? 'bg-primary/5' : ''}`}
              >
                <span aria-hidden className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-lg shrink-0">
                  {ICONS[n.type] ?? '🔔'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{n.title}</p>
                  <p className="text-xs text-subtle truncate">{n.body}</p>
                </div>
                <span className="text-[11px] text-subtle shrink-0">{relativeTime(n.createdAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
