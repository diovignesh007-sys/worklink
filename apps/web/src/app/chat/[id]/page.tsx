'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { ConversationView, MessageView } from '@worklink/types';
import { Avatar, Button, Sheet } from '@/components/ui';
import { useSession } from '@/lib/store';
import { getSocket } from '@/lib/socket';

export default function ConversationPage() {
  const params = useParams<{ id: string }>();
  const user = useSession((s) => s.user);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [conv, setConv] = useState<ConversationView | null>(null);
  const [text, setText] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [msgs, convs] = await Promise.all([
        api.conversationMessages(params.id),
        api.conversations(),
      ]);
      setMessages(msgs.data.reverse());
      setConv(convs.find((c) => c.id === params.id) ?? null);
      await api.markRead(params.id);
      await getSocket()?.emitWithAck?.('noop').catch(() => undefined);
    } catch {
      /* not a member / offline */
    }
  }, [params.id]);

  useEffect(() => {
    void load();
    const socket = getSocket();
    socket?.emit('conversation:join', params.id);

    const onNew = (e: Event) => {
      const detail = (e as CustomEvent<{ message: MessageView & { conversationId?: string } }>).detail;
      const msg = detail?.message;
      if (msg && (msg.conversationId === params.id || 'id' in msg)) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg, readBy: msg.readBy ?? [] }]));
        if (msg.senderId !== user?.id) void api.markRead(params.id);
      }
    };
    const onTyping = (e: Event) => {
      const d = (e as CustomEvent<{ userId: string; isTyping: boolean }>).detail;
      if (d.userId !== user?.id) setPeerTyping(d.isTyping);
    };
    window.addEventListener('wl:message:new', onNew);
    window.addEventListener('wl:typing', onTyping);
    return () => {
      socket?.emit('conversation:leave', params.id);
      window.removeEventListener('wl:message:new', onNew);
      window.removeEventListener('wl:typing', onTyping);
    };
  }, [params.id, user?.id, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, peerTyping]);

  function send() {
    const value = text.trim();
    if (!value) return;
    setText('');
    // REST send (persisted); realtime copy arrives via socket
    api.sendMessage(params.id, { text: value }).then((msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    }).catch(() => {
      // Offline queue: retry once on reconnect
      setTimeout(() => void api.sendMessage(params.id, { text: value }).then((m) => setMessages((prev) => prev.concat(m))), 1500);
    });
  }

  function onType() {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('typing', { conversationId: params.id, isTyping: true });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit('typing', { conversationId: params.id, isTyping: false }), 1200);
  }

  async function attachImage(file: File) {
    if (file.size > 5 * 1024 * 1024) return;
    const presign = await api.uploadUrl({ filename: file.name, contentType: file.type, sizeBytes: file.size, purpose: 'CHAT' });
    await fetch(presign.uploadUrl, { method: 'PUT', body: file, headers: presign.headers ?? { 'Content-Type': file.type } });
    await api.confirmUpload(presign.objectKey);
    const msg = await api.sendMessage(params.id, { attachmentUrls: [presign.publicUrl] });
    setMessages((prev) => prev.concat(msg));
  }

  const peer = conv?.members.find((m) => m.id !== user?.id);

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-line bg-card">
        <Link href="/chat" aria-label="Back to chats" className="p-1">←</Link>
        <Avatar src={peer?.avatarUrl} name={peer?.displayName ?? 'Chat'} size={36} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{peer?.displayName ?? 'Conversation'}</p>
          <p className="text-[11px] text-subtle truncate">
            {peerTyping ? 'typing…' : conv?.job ? (
              <Link href={`/jobs/${conv.job.id}`} className="underline">{conv.job.title}</Link>
            ) : 'WorkLink chat'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setReportOpen(true)} aria-label="Report conversation">⚑</Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" role="log" aria-live="polite">
        {messages.map((m) => {
          if (m.isSystem) {
            return (
              <p key={m.id} className="text-center text-[11px] text-subtle bg-line/40 rounded-full px-3 py-1 mx-auto w-fit">
                {m.text}
              </p>
            );
          }
          const mine = m.senderId === user?.id;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] ${mine ? 'bg-primary text-on-primary rounded-br-sm' : 'bg-card border border-line rounded-bl-sm'}`}>
                {m.attachments.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.url} src={a.url} alt="Shared photo" className="rounded-xl mb-1 max-h-56 w-auto" />
                ))}
                {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                <p className={`text-[10px] mt-0.5 ${mine ? 'text-on-primary/70' : 'text-subtle'}`}>
                  {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  {mine && (m.readBy.length > 0 ? ' · read' : ' · sent')}
                </p>
              </div>
            </div>
          );
        })}
        {peerTyping && (
          <div className="flex justify-start"><div className="bg-card border border-line rounded-2xl px-4 py-2 text-subtle text-sm">● ● ●</div></div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-line bg-card flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && attachImage(e.target.files[0])} />
        <Button variant="ghost" onClick={() => fileRef.current?.click()} aria-label="Attach photo">📷</Button>
        <textarea
          className="flex-1 resize-none rounded-2xl border border-line bg-bg px-3.5 py-2.5 text-[15px] max-h-28"
          rows={1}
          placeholder="Message…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onType();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          aria-label="Message text"
        />
        <Button onClick={send} disabled={!text.trim()} aria-label="Send message">➤</Button>
      </div>

      <ReportConversationSheet open={reportOpen} onClose={() => setReportOpen(false)} conversationId={params.id} peerName={peer?.displayName ?? ''} />
    </div>
  );
}

function ReportConversationSheet({ open, onClose, conversationId, peerName }: { open: boolean; onClose: () => void; conversationId: string; peerName: string }) {
  const [done, setDone] = useState(false);
  const [blocked, setBlocked] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title={done ? 'Done' : 'Safety & reporting'}>
      {!done ? (
        <div className="space-y-3 text-sm">
          <p className="text-subtle">Never pay to get a job. Never share bank details or OTPs in chat.</p>
          <Button variant="danger" className="w-full" onClick={async () => {
            await api.report({ targetType: 'CONVERSATION', targetId: conversationId, reason: 'OTHER', details: 'Reported from chat' }).catch(() => undefined);
            setDone(true);
          }}>
            Report {peerName}
          </Button>
          <Button variant="outline" className="w-full" disabled={blocked} onClick={async () => {
            const peerId = (await api.conversations()).find((c) => c.id === conversationId)?.members.find((m) => true)?.id;
            if (peerId) await api.block(peerId).catch(() => undefined);
            setBlocked(true);
          }}>
            {blocked ? 'Blocked ✓' : `Block ${peerName}`}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-subtle py-3">Thanks — our moderation team will take a look.</p>
      )}
    </Sheet>
  );
}
