import { getDb } from '../db/db.js';
import { newId } from '../lib/ids.js';
import type { NotificationType } from '@worklink/types';
import { sendEmail } from './email.js';
import { env } from '../config/env.js';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath?: string | null;
  actorAvatarUrl?: string | null;
  /** dedupe key — same (user, key) is stored once; safe to call repeatedly */
  dedupeKey?: string | null;
  /** email may carry richer text than the in-app body */
  emailBody?: string | null;
}

const DEFAULT_PREFS = {
  inApp: {} as Record<string, boolean>,
  email: {} as Record<string, boolean>,
  push: {} as Record<string, boolean>,
  dailyDigest: true,
};

export async function notify(input: NotifyInput): Promise<void> {
  const db = getDb();

  const settingsRow = await db
    .selectFrom('userSettings')
    .select('notificationPrefs')
    .where('userId', '=', input.userId)
    .executeTakeFirst();
  const prefs = { ...DEFAULT_PREFS, ...((settingsRow?.notificationPrefs as object | undefined) ?? {}) };

  // Respect in-app preference
  if (prefs.inApp?.[input.type] === false) return;

  // Deduplicate (partial unique index ignores NULL keys)
  if (input.dedupeKey) {
    try {
      await db
        .insertInto('notifications')
        .values({
          id: newId(),
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
          linkPath: input.linkPath ?? null,
          actorAvatarUrl: input.actorAvatarUrl ?? null,
          dedupeKey: input.dedupeKey,
        })
        .execute();
    } catch {
      return; // duplicate — done
    }
  } else {
    await db
      .insertInto('notifications')
      .values({
        id: newId(),
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        linkPath: input.linkPath ?? null,
        actorAvatarUrl: input.actorAvatarUrl ?? null,
      })
      .execute();
  }

  // Email (respects prefs)
  if (prefs.email?.[input.type] !== false) {
    const u = await db.selectFrom('users').select(['email', 'emailVerifiedAt']).where('id', '=', input.userId).executeTakeFirst();
    if (u?.email && u.emailVerifiedAt) {
      void sendEmail(u.email, input.title, input.emailBody ?? input.body);
    }
  }

  // Web Push: dispatch happens through the realtime bus (see ws/realtime.ts) so
  // the service worker receives it; storage of subscriptions is in `devices`.
  // Per-user daily caps for push are enforced in the publisher (jobs.publish).
}

/** Minimal audit log writer (append-only, §7). */
export async function audit(actorId: string | null, action: string, targetType?: string, targetId?: string, meta?: unknown) {
  const db = getDb();
  await db
    .insertInto('auditLog')
    .values({ id: newId(), actorId, action, targetType: targetType ?? null, targetId: targetId ?? null, meta: meta ?? null })
    .execute();
}
