'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSession } from '@/lib/store';
import { Button, EmptyState, Skeleton } from '@/components/ui';

export default function JobChatBridgePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useSession((s) => s.user);
  const [state, setState] = useState<'loading' | 'error'>('loading');
  const [message, setMessage] = useState('Opening chat…');

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const job = await api.getJob(params.id);
        if (job.viewerRelationship?.isOwner) {
          setMessage('This is your own post — open it to manage applicants.');
          setState('error');
          return;
        }
        const conv = await api.createConversation(params.id, job.employer.id);
        router.replace(`/chat/${conv.id}`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Could not open chat');
        setState('error');
      }
    })();
  }, [params.id, user, router]);

  if (state === 'loading') return <div className="p-6"><Skeleton className="h-24" /></div>;
  return (
    <div className="p-6">
      <EmptyState icon="💬" title={message} />
      <div className="flex justify-center">
        <Button onClick={() => router.push(`/jobs/${params.id}`)}>Back to job</Button>
      </div>
    </div>
  );
}
