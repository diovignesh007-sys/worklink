import 'dotenv/config';

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  return v === undefined ? fallback : Number(v);
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  return v === undefined ? fallback : v === '1' || v.toLowerCase() === 'true';
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.VITEST === 'true' || process.env.NODE_ENV === 'test',
  logLevel: process.env.LOG_LEVEL ?? 'info',

  databaseUrl: process.env.DATABASE_URL ?? '',
  embeddedDb: bool('WORKLINK_EMBEDDED_DB', false),
  inMemoryRedis: bool('WORKLINK_INMEMORY_REDIS', false),
  redisUrl: process.env.REDIS_URL ?? '',

  jwtAccessSecret: req('JWT_ACCESS_SECRET', 'dev-access-secret-change-me-32-chars-min'),
  jwtRefreshSecret: req('JWT_REFRESH_SECRET', 'dev-refresh-secret-change-me-32-chars-min'),
  accessTokenTtlSeconds: num('ACCESS_TOKEN_TTL_SECONDS', 900),
  refreshTokenTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 30),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  apiPort: num('API_PORT', 4000),
  apiBaseUrl: process.env.API_BASE_URL ?? `http://localhost:${num('API_PORT', 4000)}`,

  storageDriver: process.env.STORAGE_DRIVER ?? 'local',
  s3Endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  s3Region: process.env.S3_REGION ?? 'us-east-1',
  s3Bucket: process.env.S3_BUCKET ?? 'worklink-media',
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
  maxUploadMb: num('MAX_UPLOAD_MB', 5),

  mapProvider: process.env.MAP_PROVIDER ?? 'none',
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',

  otpChannel: process.env.OTP_CHANNEL ?? 'console',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
  msg91AuthKey: process.env.MSG91_AUTH_KEY ?? '',

  emailDriver: process.env.EMAIL_DRIVER ?? 'console',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'WorkLink <no-reply@worklink.app>',

  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:dev@worklink.app',

  paymentsEnabled: bool('PAYMENTS_ENABLED', false),
  paymentProvider: process.env.PAYMENT_PROVIDER ?? 'mock',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',

  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
};
