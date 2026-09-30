import { getDb } from '../../db/db.js';
import { newId, newTxnId } from '../../lib/ids.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { getPaymentProvider } from './provider.js';
import { notify } from '../notify.js';
import { audit } from '../notify.js';
import type { LedgerEntryView, PaymentView } from '@worklink/types';

/**
 * Escrow flow (§5.9): employer funds assignment → HELD → work completed →
 * employer confirms → RELEASED (+ worker_earnings credit). Every write is
 * idempotent; every money movement is a balanced double-entry txn.
 */

async function postEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trx: any,
  txnId: string,
  paymentId: string | null,
  entries: Array<{ type: 'DEBIT' | 'CREDIT'; account: string; amountMinor: number; currency: string; memo?: string }>
): Promise<void> {
  for (const e of entries) {
    await trx
      .insertInto('ledgerEntries')
      .values({
        id: newId(),
        txnId,
        paymentId,
        entryType: e.type,
        account: e.account,
        amountMinor: e.amountMinor,
        currency: e.currency,
        memo: e.memo ?? null,
      })
      .execute();
  }
}

export async function createIntent(
  userId: string,
  input: { assignmentId: string; amountMinor: number; currency: string; idempotencyKey: string }
): Promise<PaymentView & { checkout?: unknown }> {
  const db = getDb();
  const provider = getPaymentProvider();

  const assignment = await db.selectFrom('assignments').selectAll().where('id', '=', input.assignmentId).executeTakeFirst();
  if (!assignment) throw notFound('Assignment not found');
  if (assignment.employerId !== userId) throw forbidden('Only the employer funds the assignment');

  // Idempotency: same key returns the same payment
  const existingKey = await db
    .selectFrom('payments')
    .selectAll()
    .where('idempotencyKey', '=', input.idempotencyKey)
    .executeTakeFirst();
  if (existingKey) return mapPayment(existingKey);

  const existing = await db
    .selectFrom('payments')
    .selectAll()
    .where('assignmentId', '=', input.assignmentId)
    .where('status', 'in', ['PENDING', 'AUTHORIZED', 'HELD'])
    .executeTakeFirst();
  if (existing) return mapPayment(existing);

  const order = await provider.createOrder({
    orderId: input.assignmentId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: 'WorkLink escrow funding',
  });

  const id = newId();
  await db
    .insertInto('payments')
    .values({
      id,
      assignmentId: input.assignmentId,
      employerId: userId,
      workerId: assignment.workerId,
      provider: provider.name,
      providerOrderId: order.providerOrderId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'PENDING',
      idempotencyKey: input.idempotencyKey,
    })
    .execute();

  const row = await db.selectFrom('payments').selectAll().where('id', '=', id).executeTakeFirstOrThrow();
  return { ...mapPayment(row), checkout: order.checkout };
}

/** Mock/checkout callback: funds land in escrow. */
export async function capture(paymentId: string, userId: string): Promise<PaymentView> {
  const db = getDb();
  const provider = getPaymentProvider();
  const p = await db.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirst();
  if (!p) throw notFound('Payment not found');
  if (p.employerId !== userId) throw forbidden('Not your payment');
  if (p.status !== 'PENDING') throw conflict(`Cannot capture from ${p.status}`);

  const res = await provider.capture(p.providerOrderId ?? '');
  if (!res.ok) throw conflict('Capture failed at provider');

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('payments').set({ status: 'HELD', updatedAt: new Date() }).where('id', '=', paymentId).execute();
    await postEntries(
      trx,
      newTxnId(),
      paymentId,
      [
        { type: 'DEBIT', account: 'employer_wallet', amountMinor: Number(p.amountMinor), currency: p.currency, memo: 'escrow funding' },
        { type: 'CREDIT', account: 'escrow', amountMinor: Number(p.amountMinor), currency: p.currency, memo: 'escrow funding' },
      ]
    );
  });

  await notify({
    userId: p.workerId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment secured in escrow',
    body: 'Funds for your assignment are held and will be released on completion',
    linkPath: '/work',
    dedupeKey: `pay:${paymentId}:held`,
  });

  const row = await db.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirstOrThrow();
  return mapPayment(row);
}

export async function release(paymentId: string, userId: string, portionMinor?: number): Promise<PaymentView> {
  const db = getDb();
  const provider = getPaymentProvider();
  const p = await db.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirst();
  if (!p) throw notFound('Payment not found');
  if (p.employerId !== userId) throw forbidden('Only the employer releases payment');
  if (p.status !== 'HELD') throw conflict(`Cannot release from ${p.status}`);

  const amount = Math.min(portionMinor ?? Number(p.amountMinor), Number(p.amountMinor));
  if (amount <= 0) throw conflict('Nothing to release');

  const res = await provider.payout(p.providerOrderId ?? '', amount);
  if (!res.ok) throw conflict('Payout failed at provider');

  const fullyReleased = amount >= Number(p.amountMinor);

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('payments')
      .set({ status: fullyReleased ? 'RELEASED' : 'HELD', updatedAt: new Date() })
      .where('id', '=', paymentId)
      .execute();
    await postEntries(
      trx,
      newTxnId(),
      paymentId,
      [
        { type: 'DEBIT', account: 'escrow', amountMinor: amount, currency: p.currency, memo: 'release to worker' },
        { type: 'CREDIT', account: 'worker_earnings', amountMinor: amount, currency: p.currency, memo: 'release to worker' },
      ]
    );
  });

  await notify({
    userId: p.workerId,
    type: 'PAYMENT_RECEIVED',
    title: 'Payment released 🎉',
    body: 'Your earnings for this assignment were released',
    linkPath: '/earnings',
    dedupeKey: `pay:${paymentId}:released:${amount}`,
  });
  await audit(userId, 'payment.release', 'PAYMENT', paymentId, { amount });

  const row = await db.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirstOrThrow();
  return mapPayment(row);
}

export async function refund(paymentId: string, userId: string): Promise<PaymentView> {
  const db = getDb();
  const provider = getPaymentProvider();
  const p = await db.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirst();
  if (!p) throw notFound('Payment not found');
  if (p.employerId !== userId) throw forbidden('Only the employer can request a refund');
  if (p.status !== 'HELD' && p.status !== 'DISPUTE_HOLD') throw conflict(`Cannot refund from ${p.status}`);

  const res = await provider.refund(p.providerOrderId ?? '', Number(p.amountMinor));
  if (!res.ok) throw conflict('Refund failed at provider');

  await db.transaction().execute(async (trx) => {
    await trx.updateTable('payments').set({ status: 'REFUNDED', updatedAt: new Date() }).where('id', '=', paymentId).execute();
    await postEntries(
      trx,
      newTxnId(),
      paymentId,
      [
        { type: 'DEBIT', account: 'escrow', amountMinor: Number(p.amountMinor), currency: p.currency, memo: 'refund to employer' },
        { type: 'CREDIT', account: 'employer_wallet', amountMinor: Number(p.amountMinor), currency: p.currency, memo: 'refund to employer' },
      ]
    );
  });

  await audit(userId, 'payment.refund', 'PAYMENT', paymentId);
  const row = await db.selectFrom('payments').selectAll().where('id', '=', paymentId).executeTakeFirstOrThrow();
  return mapPayment(row);
}

export async function handleWebhook(providerName: string, rawBody: string, signature: string | null): Promise<{ received: boolean }> {
  const db = getDb();
  const provider = getPaymentProvider();
  if (provider.name !== providerName) return { received: false };

  const verified = provider.verifyWebhook(rawBody, signature);
  if (!verified.ok) return { received: false };

  // Replay protection: (provider, event_id) unique
  try {
    await db
      .insertInto('paymentEvents')
      .values({
        id: newId(),
        paymentId: null,
        provider: providerName,
        eventId: verified.eventId,
        type: verified.type,
        payload: verified.payload as object,
      })
      .execute();
  } catch {
    return { received: true }; // duplicate — already processed
  }

  // State transitions live in the mock/checkout flow; webhooks are recorded
  // and can drive async captures for real gateways.
  return { received: true };
}

export async function assignmentPayments(assignmentId: string, userId: string) {
  const db = getDb();
  const a = await db.selectFrom('assignments').selectAll().where('id', '=', assignmentId).executeTakeFirst();
  if (!a) throw notFound('Assignment not found');
  if (a.employerId !== userId && a.workerId !== userId) throw forbidden('Not a participant');

  const payments = await db.selectFrom('payments').selectAll().where('assignmentId', '=', assignmentId).orderBy('createdAt', 'desc').execute();
  const ledger = await db.selectFrom('ledgerEntries').selectAll().where('paymentId', 'in', payments.map((p) => p.id).concat('none')).orderBy('createdAt', 'desc').limit(100).execute();

  return {
    payments: payments.map(mapPayment),
    ledger: ledger.map(mapLedger),
  };
}

export async function myEarnings(userId: string) {
  const db = getDb();
  const profile = await db.selectFrom('profiles').select('currency').where('userId', '=', userId).executeTakeFirst();
  const rows = await db
    .selectFrom('ledgerEntries')
    .innerJoin('payments', 'payments.id', 'ledgerEntries.paymentId')
    .select(['ledgerEntries.id', 'ledgerEntries.txnId', 'ledgerEntries.entryType', 'ledgerEntries.account', 'ledgerEntries.amountMinor', 'ledgerEntries.currency', 'ledgerEntries.memo', 'ledgerEntries.createdAt'])
    .where('payments.workerId', '=', userId)
    .where('ledgerEntries.account', '=', 'worker_earnings')
    .orderBy('ledgerEntries.createdAt', 'desc')
    .limit(100)
    .execute();

  const total = rows.reduce((acc, r) => acc + Number(r.amountMinor), 0);
  return {
    totalEarnedMinor: total,
    currency: rows[0]?.currency ?? profile?.currency ?? 'USD',
    entries: rows.map(mapLedger),
  };
}

function mapPayment(p: {
  id: string;
  assignmentId: string;
  provider: string;
  providerOrderId: string | null;
  amountMinor: string | number;
  currency: string;
  status: string;
  createdAt: Date;
}): PaymentView {
  return {
    id: p.id,
    assignmentId: p.assignmentId,
    provider: p.provider,
    providerOrderId: p.providerOrderId,
    amountMinor: Number(p.amountMinor),
    currency: p.currency,
    status: p.status as PaymentView['status'],
    createdAt: p.createdAt.toISOString(),
  };
}

function mapLedger(e: {
  id: string;
  txnId: string;
  entryType: string;
  account: string;
  amountMinor: string | number;
  currency: string;
  memo: string | null;
  createdAt: Date;
}): LedgerEntryView {
  return {
    id: e.id,
    txnId: e.txnId,
    entryType: e.entryType as LedgerEntryView['entryType'],
    account: e.account,
    amountMinor: Number(e.amountMinor),
    currency: e.currency,
    memo: e.memo,
    createdAt: e.createdAt.toISOString(),
  };
}
