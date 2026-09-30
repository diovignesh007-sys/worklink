'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ConversationView } from '@worklink/types';
import { Avatar, EmptyState, Skeleton } from '@/components/ui';
import { useSession } from '@/lib/store';
import { getSocket } from '@/lib/socket';
import { relativeTime } from '@/components/job-card';

export default function ChatListPage() {
  const user = useSession((s) => s.user);
  const [convs, setConvs] = useState<ConversationView[] | null>(null);

  async function load() {
    try {
      setConvs(await api.conversations());
    } catch {
      setConvs([]);
    }
  }

  useEffect(() => {
    void load();
    const onMsg = () => void load();
    window.addEventListener('wl:message:new', onMsg);
    return () => window.removeEventListener('wl:message:new', onMsg);
  }, []);

  if (!user) return <EmptyState icon="🔐" title="Log in to see your chats" />;

  return (
    <div className="pb-24">
      <h1 className="font-black text-lg p-4 pb-2">Chats</h1>
      {convs === null ? (
        <div className="p-4 space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : convs.length === 0 ? (
        <EmptyState icon="💬" title="No conversations yet" hint="Open a job and tap Chat to start talking with employers or applicants." />
      ) : (
        <ul>
          {convs.map((c) => {
            const peer = c.members.find((m) => m.id !== user.id) ?? c.members[0];
            return (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-line active:bg-line/30">
                  <Avatar src={peer?.avatarUrl} name={peer?.displayName ?? 'Chat'} size={48} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between items-baseline gap-2">
                      <p className="font-semibold text-sm truncate">{peer?.displayName ?? 'Conversation'}</p>
                      <span className="text-[11px] text-subtle shrink-0">{c.lastMessage ? relativeTime(c.lastMessage.createdAt) : ''}</span>
                    </div>
                    <p className="text-xs text-subtle truncate">{c.job ? `${c.job.title} · ` : ''}{c.lastMessage?.text ?? 'Say hello 👋'}</p>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-on-primary text-[11px] font-bold flex items-center justify-center">
                      {c.unreadCount}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {getSocket()?.connected ? null : null}
    </div>
  );
}
