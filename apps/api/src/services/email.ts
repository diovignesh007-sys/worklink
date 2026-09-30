import { env } from '../config/env.js';

export interface EmailSender {
  send(to: string, subject: string, text: string): Promise<void>;
}

const consoleDriver: EmailSender = {
  async send(to, subject, text) {
    console.log(`[email:console] → ${to} | ${subject}\n${text}\n`);
  },
};

const resendDriver: EmailSender = {
  async send(to, subject, text) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.emailFrom, to, subject, text }),
    });
    if (!res.ok) console.error('[email:resend] failed', res.status, await res.text());
  },
};

let driver: EmailSender | null = null;

export function getEmailSender(): EmailSender {
  if (!driver) driver = env.emailDriver === 'resend' ? resendDriver : consoleDriver;
  return driver;
}

export function sendEmail(to: string, subject: string, text: string): Promise<void> {
  return getEmailSender()
    .send(to, subject, text)
    .catch((err) => console.error('[email] send failed:', (err as Error).message));
}
