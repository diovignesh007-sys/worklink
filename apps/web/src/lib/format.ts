import type { PayType } from '@worklink/types';

const SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', GBP: '£', INR: '₹', NGN: '₦', BRL: 'R$', ZAR: 'R', PHP: '₱', IDR: 'Rp', KES: 'KSh',
};

/** Format minor units for display in the viewer's locale/currency. */
export function formatMoney(amountMinor: number, currency: string, locale = 'en'): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: major % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    const sym = SYMBOLS[currency] ?? `${currency} `;
    return `${sym}${major.toLocaleString(locale)}`;
  }
}

export const PAY_TYPE_SUFFIX: Record<PayType, string> = {
  PER_HOUR: '/hr',
  PER_DAY: '/day',
  FIXED_PER_WORK: ' per job',
};
