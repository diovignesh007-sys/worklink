import type { FeedTab, JobCategory } from '@worklink/types';

/**
 * Pluggable feed ranking (§5.2). Blend of recency, distance, skill/category
 * match and employer rating. Swap by registering a different FeedRanker.
 */
export interface RankerCandidate {
  jobId: string;
  employerId: string;
  createdAt: Date;
  startAt: Date;
  lat: number;
  lng: number;
  city: string | null;
  category: JobCategory | string;
  skillsRequired: string[];
  payAmountMinor: number;
  currency: string;
  payType: string;
  employerRatingAvg: number | null;
  employerRatingCount: number;
  workersNeeded: number;
  filledCount: number;
}

export interface RankerViewer {
  lat: number | null;
  lng: number | null;
  skills: string[];
  followingEmployerIds: string[];
}

export interface RankedCandidate extends RankerCandidate {
  score: number;
  distanceKm: number | null;
  reason: 'nearby' | 'matched' | 'recent' | 'following';
}

export interface FeedRanker {
  readonly name: string;
  rank(candidates: RankerCandidate[], viewer: RankerViewer, tab: FeedTab): RankedCandidate[];
}

const HALF_LIFE_HOURS = 36; // recency half-life

function recencyScore(createdAt: Date, now: Date): number {
  const hours = Math.max(0, (now.getTime() - createdAt.getTime()) / 3_600_000);
  return Math.pow(0.5, hours / HALF_LIFE_HOURS); // 1.0 → 0.0
}

function distanceScore(km: number | null): number {
  if (km === null) return 0.35;
  if (km <= 1) return 1;
  return Math.max(0, 1 - Math.log10(km) / Math.log10(50)); // 1km→1.0, 50km→0
}

function skillScore(candidateSkills: string[], viewerSkills: string[], category: string, viewerCategoryAffinity: Set<string>): number {
  const cs = candidateSkills.map((s) => s.toLowerCase());
  const vs = viewerSkills.map((s) => s.toLowerCase());
  const overlap = cs.filter((s) => vs.includes(s)).length;
  let score = overlap > 0 ? 0.6 + 0.4 * Math.min(1, overlap / 3) : 0;
  if (viewerCategoryAffinity.has(category)) score += 0.25;
  return Math.min(1, score);
}

function employerScore(ratingAvg: number | null, ratingCount: number): number {
  if (ratingAvg === null || ratingCount === 0) return 0.5; // new employer neutral
  const confidence = Math.min(1, ratingCount / 10);
  return ((ratingAvg - 1) / 4) * 0.7 + confidence * 0.3;
}

export class DefaultFeedRanker implements FeedRanker {
  readonly name = 'default-v1';

  rank(candidates: RankerCandidate[], viewer: RankerViewer, tab: FeedTab): RankedCandidate[] {
    const now = new Date();
    const affinity = new Set<string>(viewer.skills.map((s) => s.toUpperCase()));

    const ranked = candidates.map((c) => {
      const km = viewer.lat !== null && viewer.lng !== null ? haversine(viewer.lat, viewer.lng, c.lat, c.lng) : null;
      const rec = recencyScore(c.createdAt, now);
      const dist = distanceScore(km);
      const skill = skillScore(c.skillsRequired, viewer.skills, String(c.category).toUpperCase(), affinity);
      const employer = employerScore(c.employerRatingAvg, c.employerRatingCount);
      const following = viewer.followingEmployerIds.includes(c.employerId) ? 1 : 0;

      // Weights per tab — nearby favours distance, matched favours skills
      const w =
        tab === 'nearby'
          ? { rec: 0.25, dist: 0.4, skill: 0.2, employer: 0.15 }
          : tab === 'matched'
            ? { rec: 0.15, dist: 0.15, skill: 0.5, employer: 0.2 }
            : { rec: 0.35, dist: 0.15, skill: 0.2, employer: 0.3 };

      const score = w.rec * rec + w.dist * dist + w.skill * skill + w.employer * employer + (following ? 0.15 : 0);

      const reason: RankedCandidate['reason'] =
        following ? 'following' : skill >= 0.6 ? 'matched' : km !== null && km <= 25 ? 'nearby' : 'recent';

      return { ...c, score, distanceKm: km, reason };
    });

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }
}

// haversine duplicated locally to keep this module dependency-free for unit tests
function haversine(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
