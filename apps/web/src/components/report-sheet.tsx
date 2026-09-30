'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Sheet } from '@/components/ui';

export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'USER' | 'JOB' | 'MESSAGE' | 'CONVERSATION';
  targetId: string;
}) {
  const [reason, setReason] = useState('SCAM');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} title={sent ? 'Thank you' : 'Report'}>
      {sent ? (
        <p className="text-sm text-subtle py-4">Our moderation team will review this. You can also block the user from their profile.</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            await api.report({ targetType, targetId, reason, details }).catch(() => undefined);
            setSent(true);
          }}
        >
          <p className="text-sm text-subtle">
            Scams exist everywhere. WorkLink will <b>never</b> ask workers to pay to get a job.
          </p>
          <select className="w-full h-11 rounded-xl border border-line bg-card px-3" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason">
            {['SPAM', 'SCAM', 'FAKE_JOB', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <textarea className="w-full rounded-xl border border-line bg-card p-3 text-sm" rows={3} placeholder="What happened? (optional)" value={details} onChange={(e) => setDetails(e.target.value)} />
          <Button type="submit" variant="danger" className="w-full">Submit report</Button>
        </form>
      )}
    </Sheet>
  );
}
