import { getDb } from '../db/db.js';
import { newId } from '../lib/ids.js';
import { jsonb } from '../lib/jsonb.js';
import { forbidden, notFound } from '../lib/errors.js';
import { notify } from './notify.js';
import type { ConversationView, MessageView } from '@worklink/types';

/**
 * Chat (§5.7): 1:1 conversations tied to a job. Rooms are per conversation;
 * Socket.IO wiring lives in ../realtime/bus.ts. Includes basic profanity
 * filtering and link-safety warnings.
 */

const BLOCKED_WORDS = ['fuck', 'shit', 'bastard', 'slur1'];

export function filterMessage(text: string): { clean: string; flagged: boolean; linkWarning: boolean } {
  let clean = text;
  let flagged = false;
  for (const w of BLOCKED_WORDS) {
    if (clean.toLowerCase().includes(w)) {
      flagged = true;
      clean = clean.replace(new RegExp(w, 'gi'), '*'.repeat(w.length));
    }
  }
  const linkWarning = /https?:\/\//i.test(text);
  return { clean, flagged, linkWarning };
}

export async function getOrCreateConversation(jobId: string, peerA: string, peerB: string): Promise<string> {
  const db = getDb();
  const existing = await db
    .selectFrom('conversations')
    .innerJoin('conversationMembers', 'conversationMembers.conversationId', 'conversations.id')
    .select('conversations.id')
    .where('conversations.jobId', '=', jobId)
    .where('conversationMembers.userId', 'in', [peerA, peerB])
    .groupBy('conversations.id')
    .having((eb) => eb.fn.countAll(), '=', 2)
    .executeTakeFirst();
  if (existing) return existing.id;

  const id = newId();
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('conversations').values({ id, jobId }).execute();
    await trx.insertInto('conversationMembers').values([
      { id: newId(), conversationId: id, userId: peerA },
      { id: newId(), conversationId: id, userId: peerB },
    ]).execute();
  });
  return id;
}

export async function listConversations(userId: string): Promise<ConversationView[]> {
  const db = getDb();
  const convs = await db
    .selectFrom('conversationMembers')
    .innerJoin('conversations', 'conversations.id', 'conversationMembers.conversationId')
    .select(['conversations.id', 'conversations.jobId', 'conversations.lastMessageAt'])
    .where('conversationMembers.userId', '=', userId)
    .orderBy('conversations.lastMessageAt', 'desc')
    .limit(50)
    .execute();

  const result: ConversationView[] = [];
  for (const c of convs) {
    const members = await db
      .selectFrom('conversationMembers')
      .innerJoin('profiles', 'profiles.userId', 'conversationMembers.userId')
      .select(['profiles.userId', 'profiles.displayName', 'profiles.avatarUrl'])
      .where('conversationMembers.conversationId', '=', c.id)
      .execute();

    const last = await db
      .selectFrom('messages')
      .selectAll()
      .where('conversationId', '=', c.id)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();

    const unread = await countUnread(c.id, userId);

    const jobRow = c.jobId ? await db.selectFrom('jobs').select(['id', 'title']).where('id', '=', c.jobId).executeTakeFirst() : undefined;
    result.push({
      id: c.id,
      job: jobRow ?? null,
      members: members.map((m) => ({ id: m.userId, displayName: m.displayName, avatarUrl: m.avatarUrl })),
      lastMessage: last
        ? { id: last.id, text: last.text ?? '', senderId: last.senderId ?? '', createdAt: last.createdAt.toISOString(), isSystem: last.isSystem }
        : null,
      unreadCount: unread,
      updatedAt: (c.lastMessageAt ?? new Date(0)).toISOString(),
    });
  }
  return result;
}

async function countUnread(conversationId: string, userId: string): Promise<number> {
  const db = getDb();
  const me = await db
    .selectFrom('conversationMembers')
    .select('lastReadAt')
    .where('conversationId', '=', conversationId)
    .where('userId', '=', userId)
    .executeTakeFirst();
  const lastRead = me?.lastReadAt ?? new Date(0);
  const row = await db
    .selectFrom('messages')
    .select((f) => f.fn.countAll().as('cnt'))
    .where('conversationId', '=', conversationId)
    .where('senderId', '!=', userId)
    .where('createdAt', '>', lastRead)
    .executeTakeFirst();
  return Number(row?.cnt ?? 0);
}

export async function getMessages(conversationId: string, userId: string, cursor?: string) {
  const db = getDb();
  await assertMember(conversationId, userId);
  const limit = 30;
  let q = db
    .selectFrom('messages')
    .select(['id', 'conversationId', 'senderId', 'text', 'attachments', 'isSystem', 'createdAt'])
    .where('conversationId', '=', conversationId)
    .orderBy('createdAt', 'desc')
    .limit(limit + 1);
  if (cursor) q = q.where('createdAt', '<', new Date(cursor));

  const rows = await q.execute();
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit && page.length ? page[page.length - 1]!.createdAt.toISOString() : null;

  const reads = await db
    .selectFrom('messageReads')
    .select(['messageId', 'userId'])
    .where(
      'messageId',
      'in',
      page.map((m) => m.id)
    )
    .execute();

  const data: MessageView[] = page.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    text: m.text,
    attachments: (m.attachments as Array<{ url: string; kind: 'IMAGE' }>) ?? [],
    isSystem: m.isSystem,
    readBy: reads.filter((r) => r.messageId === m.id).map((r) => r.userId),
    createdAt: m.createdAt.toISOString(),
  }));

  return { data, meta: { nextCursor } };
}

export async function assertMember(conversationId: string, userId: string): Promise<void> {
  const db = getDb();
  const m = await db
    .selectFrom('conversationMembers')
    .select('id')
    .where('conversationId', '=', conversationId)
    .where('userId', '=', userId)
    .executeTakeFirst();
  if (!m) throw forbidden('Not a member of this conversation');
}

export interface WsDeps {
  emitToConversation(conversationId: string, event: string, payload: unknown): void;
}

export async function sendMessage(conversationId: string, senderId: string, input: { text?: string; attachmentUrls?: string[] }, ws?: WsDeps): Promise<MessageView> {
  const db = getDb();
  await assertMember(conversationId, senderId);
  if (!input.text && !(input.attachmentUrls?.length)) throw notFound('Empty message');

  const filtered = input.text ? filterMessage(input.text) : { clean: null, flagged: false, linkWarning: false };
  const id = newId();
  const now = new Date();

  const msg = await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('messages')
      .values({
        id,
        conversationId,
        senderId,
        text: filtered.clean,
        attachments: jsonb((input.attachmentUrls ?? []).map((url) => ({ url, kind: 'IMAGE' as const }))),
        isSystem: false,
        createdAt: now,
      })
      .execute();
    await trx.updateTable('conversations').set({ lastMessageAt: now }).where('id', '=', conversationId).execute();
    return trx
      .selectFrom('messages')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
  });

  const members = await db
    .selectFrom('conversationMembers')
    .select('userId')
    .where('conversationId', '=', conversationId)
    .execute();

  for (const m of members) {
    if (m.userId === senderId) continue;
    await notify({
      userId: m.userId,
      type: 'MESSAGE_NEW',
      title: 'New message',
      body: filtered.clean?.slice(0, 80) ?? '📷 Photo',
      linkPath: `/chat/${conversationId}`,
      dedupeKey: `msg:${id}:${m.userId}`,
    });
    ws?.emitToConversation(conversationId, 'message:new', { message: msg, recipientId: m.userId });
  }
  ws?.emitToConversation(conversationId, 'message:new', { message: msg });

  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    text: msg.text,
    attachments: (msg.attachments as Array<{ url: string; kind: 'IMAGE' }>) ?? [],
    isSystem: msg.isSystem,
    readBy: [],
    createdAt: msg.createdAt.toISOString(),
  };
}

export async function markRead(conversationId: string, userId: string): Promise<void> {
  const db = getDb();
  await assertMember(conversationId, userId);
  const now = new Date();
  const unread = await db
    .selectFrom('messages')
    .select(['id', 'createdAt'])
    .where('conversationId', '=', conversationId)
    .where('senderId', '!=', userId)
    .where('createdAt', '>', await lastReadOf(conversationId, userId))
    .limit(200)
    .execute();

  if (unread.length) {
    await db
      .insertInto('messageReads')
      .values(unread.map((m) => ({ id: newId(), messageId: m.id, userId, readAt: now })))
      .onConflict((oc) => oc.doNothing())
      .execute();
  }
  await db
    .updateTable('conversationMembers')
    .set({ lastReadAt: now })
    .where('conversationId', '=', conversationId)
    .where('userId', '=', userId)
    .execute();
}

async function lastReadOf(conversationId: string, userId: string): Promise<Date> {
  const db = getDb();
  const me = await db
    .selectFrom('conversationMembers')
    .select('lastReadAt')
    .where('conversationId', '=', conversationId)
    .where('userId', '=', userId)
    .executeTakeFirst();
  return me?.lastReadAt ?? new Date(0);
}

export async function postSystemMessage(conversationId: string, text: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .insertInto('messages')
    .values({ id: newId(), conversationId, senderId: null, text, isSystem: true, attachments: jsonb([]), createdAt: now })
    .execute();
  await db.updateTable('conversations').set({ lastMessageAt: now }).where('id', '=', conversationId).execute();
}
