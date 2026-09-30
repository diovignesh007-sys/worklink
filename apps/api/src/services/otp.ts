import { env } from '../config/env.js';

/** Abstraction over SMS/OTP delivery (§2: swappable channel). */
export interface OtpChannel {
  sendOtp(identifier: string, channel: 'EMAIL' | 'SMS', code: string, purpose: string): Promise<void>;
}

const consoleChannel: OtpChannel = {
  async sendOtp(identifier, channel, code, purpose) {
    console.log(`[otp:console] ${channel} → ${identifier} | purpose=${purpose} | code=${code}`);
  },
};

const twilioChannel: OtpChannel = {
  async sendOtp(identifier, channel, code) {
    if (channel !== 'SMS') return consoleChannel.sendOtp(identifier, channel, code, 'fallback');
    const sid = env.twilioAccountSid;
    const body = new URLSearchParams({
      To: identifier,
      From: env.twilioFromNumber,
      Body: `Your WorkLink code is ${code}. Valid 10 minutes.`,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${env.twilioAuthToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!res.ok) console.error('[otp:twilio] send failed', res.status);
  },
};

const msg91Channel: OtpChannel = {
  async sendOtp(identifier, _channel, code) {
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { authkey: env.msg91AuthKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mobile: identifier, OTP: code }),
    });
    if (!res.ok) console.error('[otp:msg91] send failed', res.status);
  },
};

export function getOtpChannel(): OtpChannel {
  switch (env.otpChannel) {
    case 'twilio':
      return twilioChannel;
    case 'msg91':
      return msg91Channel;
    default:
      return consoleChannel;
  }
}
