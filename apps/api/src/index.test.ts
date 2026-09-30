import { describe, it, expect } from 'vitest';
import { haversineKm, bboxAround, approximatePoint } from './lib/geo.js';
import { DefaultFeedRanker } from './services/feed-ranker.js';
import { formatMoney } from './lib/money.js';
import { encodeCursor, decodeCursor } from './lib/cursor.js';
import { filterMessage } from './services/chat-service.js';
import { sixDigitCode } from './lib/ids.js';
import { sha256, signAccessToken, verifyAccessToken } from './lib/tokens.js';

describe('geo', () => {
  it('computes haversine distance (Mumbai→Delhi ≈ 1150km)', () => {
    const d = haversineKm(19.076, 72.8777, 28.6139, 77.209);
    expect(d).toBeGreaterThan(1000);
    expect(d).toBeLessThan(1300);
  });

  it('zero distance for same point', () => {
    expect(haversineKm(10, 10, 10, 10)).toBeCloseTo(0, 5);
  });

  it('bbox contains the center', () => {
    const b = bboxAround(19.076, 72.8777, 10);
    expect(b.minLat).toBeLessThan(19.076);
    expect(b.maxLat).toBeGreaterThan(19.076);
  });

  it('approximate point stays within ~2km of origin', () => {
    const p = approximatePoint(19.076, 72.8777, 'job-123');
    const d = haversineKm(19.076, 72.8777, p.lat, p.lng);
    expect(d).toBeLessThan(2.5);
  });
});

describe('feed ranker', () => {
  const ranker = new DefaultFeedRanker();
  const now = new Date();
  const base = {
    employerId: 'e1',
    startAt: now,
    skillsRequired: ['packing'],
    payAmountMinor: 100000,
    currency: 'INR',
    payType: 'PER_DAY',
    employerRatingAvg: 4.5,
    employerRatingCount: 12,
    workersNeeded: 1,
    filledCount: 0,
  };

  it('ranks nearby+recent higher than far+old for nearby tab', () => {
    const near = { ...base, jobId: 'near', createdAt: new Date(now.getTime() - 3600_000), lat: 19.08, lng: 72.87, category: 'WAREHOUSE' };
    const far = { ...base, jobId: 'far', createdAt: new Date(now.getTime() - 20 * 3600_000), lat: 28.61, lng: 77.2, category: 'WAREHOUSE' };
    const ranked = ranker.rank([far, near], { lat: 19.076, lng: 72.8777, skills: ['packing'], followingEmployerIds: [] }, 'nearby');
    expect(ranked[0]!.jobId).toBe('near');
  });

  it('matched tab favours skill overlap', () => {
    const matching = { ...base, jobId: 'match', createdAt: new Date(now.getTime() - 10 * 3600_000), lat: 28.7, lng: 77.3, category: 'WAREHOUSE', skillsRequired: ['packing', 'loading'] };
    const nonMatching = { ...base, jobId: 'nomatch', createdAt: new Date(now.getTime() - 3600_000), lat: 19.08, lng: 72.87, category: 'CLEANING', skillsRequired: ['gardening'] };
    const ranked = ranker.rank([nonMatching, matching], { lat: 19.076, lng: 72.8777, skills: ['packing'], followingEmployerIds: [] }, 'matched');
    expect(ranked[0]!.jobId).toBe('match');
  });

  it('tags reason nearby/matched/following', () => {
    const c = { ...base, jobId: 'x', createdAt: new Date(now.getTime() - 3600_000), lat: 19.08, lng: 72.87, category: 'WAREHOUSE' };
    const ranked = ranker.rank([c], { lat: 19.076, lng: 72.8777, skills: ['packing'], followingEmployerIds: ['e1'] }, 'nearby');
    expect(ranked[0]!.reason).toBe('following');
  });
});

describe('money', () => {
  it('formats minor units without floats', () => {
    expect(formatMoney(125000, 'INR')).toMatch(/₹/);
    expect(formatMoney(125000, 'INR')).toContain('1,250');
    expect(formatMoney(9999, 'USD')).toContain('99.99');
  });
});

describe('cursor', () => {
  it('round-trips values', () => {
    const c = encodeCursor(['2026-01-01T00:00:00.000Z', 'abc-123']);
    expect(decodeCursor(c)).toEqual(['2026-01-01T00:00:00.000Z', 'abc-123']);
  });

  it('rejects garbage', () => {
    expect(() => decodeCursor('!!!not-base64url!!!')).toThrow();
  });
});

describe('chat filter', () => {
  it('masks profanity and flags links', () => {
    const r = filterMessage('what a fuckup, visit https://x.example');
    expect(r.flagged).toBe(true);
    expect(r.clean).toContain('***');
    expect(r.linkWarning).toBe(true);
  });
});

describe('ids & tokens', () => {
  it('generates 6-digit codes', () => {
    const c = sixDigitCode();
    expect(c).toMatch(/^\d{6}$/);
  });

  it('access token round-trips claims', () => {
    const t = signAccessToken({ sub: 'u1', st: 'ACTIVE' });
    expect(verifyAccessToken(t).sub).toBe('u1');
  });

  it('sha256 is stable', () => {
    expect(sha256('a')).toBe(sha256('a'));
    expect(sha256('a')).not.toBe(sha256('b'));
  });
});
