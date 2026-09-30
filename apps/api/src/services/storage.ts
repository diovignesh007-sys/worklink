import { createHmac, createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';

export type UploadPurpose = 'AVATAR' | 'COVER' | 'JOB' | 'CHAT' | 'PORTFOLIO';

export interface PresignResult {
  objectKey: string;
  uploadUrl: string;
  publicUrl: string;
  headers?: Record<string, string>;
}

const IMAGE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export function validateUpload(purpose: UploadPurpose, contentType: string, sizeBytes: number): string | null {
  if (!IMAGE_MIME[contentType]) return 'Only JPEG, PNG, WebP or HEIC images are allowed';
  const cap = purpose === 'JOB' || purpose === 'CHAT' ? env.maxUploadMb : 5;
  if (sizeBytes > cap * 1024 * 1024) return `File exceeds the ${cap} MB limit`;
  if (sizeBytes < 1024) return 'File is too small';
  return null;
}

// ── Local driver (dev default) ───────────────────────────────────────────────

const LOCAL_DIR = path.join(process.cwd(), '..', '..', 'uploads');

function localToken(objectKey: string, contentType: string): string {
  return createHmac('sha256', env.jwtRefreshSecret).update(`${objectKey}:${contentType}`).digest('base64url').slice(0, 43);
}

export function verifyLocalUploadToken(objectKey: string, contentType: string, token: string): boolean {
  return localToken(objectKey, contentType) === token;
}

export async function localSave(objectKey: string, data: Buffer): Promise<void> {
  const safe = path.normalize(objectKey).replace(/^(\.\.(\/|\\|$))+/, '');
  const dest = path.join(LOCAL_DIR, safe);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, data);
}

export async function localRead(objectKey: string): Promise<Buffer | null> {
  const safe = path.normalize(objectKey).replace(/^(\.\.(\/|\\|$))+/, '');
  try {
    return await fs.readFile(path.join(LOCAL_DIR, safe));
  } catch {
    return null;
  }
}

// ── S3 driver (MinIO-compatible, SigV4 presigned PUT) ────────────────────────

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function presignS3Put(objectKey: string, contentType: string, expiresSeconds = 600): PresignResult {
  const url = new URL(`${env.s3Endpoint.replace(/\/$/, '')}/${env.s3Bucket}/${objectKey}`);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${env.s3Region}/s3/aws4_request`;

  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${env.s3AccessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k]!)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    url.pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n');
  const kDate = hmac(`AWS4${env.s3SecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, env.s3Region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  url.search = canonicalQuery + `&X-Amz-Signature=${signature}`;
  return {
    objectKey,
    uploadUrl: url.toString(),
    publicUrl: `${env.apiBaseUrl}/api/v1/media/s3/${env.s3Bucket}/${objectKey}`,
    headers: { 'Content-Type': contentType },
  };
}

// ── Facade ───────────────────────────────────────────────────────────────────

export function presignUpload(purpose: UploadPurpose, filename: string, contentType: string): PresignResult {
  const ext = IMAGE_MIME[contentType] ?? 'bin';
  const objectKey = `${purpose.toLowerCase()}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
  // filename is not part of the key (no user-controlled path segments)

  if (env.storageDriver === 's3') {
    return presignS3Put(objectKey, contentType);
  }
  const token = localToken(objectKey, contentType);
  return {
    objectKey,
    uploadUrl: `${env.apiBaseUrl}/api/v1/uploads/local/${objectKey}?token=${token}&contentType=${encodeURIComponent(contentType)}`,
    publicUrl: `${env.apiBaseUrl}/api/v1/media/local/${objectKey}`,
  };
}

/**
 * Server-side re-encode to WebP — strips EXIF/GPS metadata (privacy §7) and
 * normalizes size. Returns null when sharp is unavailable.
 */
export async function reencodeImage(data: Buffer, maxWidth = 1600): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import('sharp');
    return await sharp(data).rotate().resize({ width: maxWidth, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch (err) {
    console.warn('[storage] sharp re-encode failed:', (err as Error).message);
    return null;
  }
}
