import { initDb, runMigrations, getDb, closeDb } from './db.js';
import { newId } from '../lib/ids.js';
import { hashPassword } from '../lib/password.js';
import { jsonb } from '../lib/jsonb.js';

/**
 * Demo seed (§9): ~30 users, ~60 jobs across several cities, applications,
 * assignments, reviews and chats so the app looks alive on first run.
 * Demo login: any seeded user with password `Worklink1` (or email demo@worklink.app).
 */

const CITIES = [
  { city: 'Mumbai', country: 'IN', lat: 19.076, lng: 72.8777, currency: 'INR', pay: 1200 },
  { city: 'Delhi', country: 'IN', lat: 28.6139, lng: 77.209, currency: 'INR', pay: 1100 },
  { city: 'Bengaluru', country: 'IN', lat: 12.9716, lng: 77.5946, currency: 'INR', pay: 1300 },
  { city: 'Lagos', country: 'NG', lat: 6.5244, lng: 3.3792, currency: 'NGN', pay: 15000 },
  { city: 'Manila', country: 'PH', lat: 14.5995, lng: 120.9842, currency: 'PHP', pay: 800 },
  { city: 'London', country: 'GB', lat: 51.5072, lng: -0.1276, currency: 'GBP', pay: 11000 },
  { city: 'New York', country: 'US', lat: 40.7128, lng: -74.006, currency: 'USD', pay: 18000 },
];

const CATEGORIES = ['CONSTRUCTION', 'WAREHOUSE', 'DELIVERY', 'CLEANING', 'AGRICULTURE', 'EVENTS', 'MOVING_PACKING', 'KITCHEN_HELP', 'GARDENING', 'SECURITY', 'DRIVING'] as const;

const TITLES: Record<string, string[]> = {
  CONSTRUCTION: ['Mason helpers for apartment finishing', 'Concrete mixing crew — 3 days', 'Tile laying assistants needed'],
  WAREHOUSE: ['Warehouse loaders — night shift', 'Forklift spotter for weekend inventory', ' Packers for e-commerce dispatch'],
  DELIVERY: ['Bike delivery — festival season rush', 'Van driver for furniture deliveries'],
  CLEANING: ['Deep cleaning crew for office floors', 'Post-construction cleanup — 2 days'],
  AGRICULTURE: ['Harvest helpers — mango orchard', 'Greenhouse planting crew'],
  EVENTS: ['Event setup crew — wedding expo', 'Stage hands for concert teardown'],
  MOVING_PACKING: ['Movers for 2BHK apartment shift', 'Packing crew for office relocation'],
  KITCHEN_HELP: ['Kitchen helpers for catering weekend', 'Dishwashers — banquet hall'],
  GARDENING: ['Garden maintenance — weekly', 'Landscaping crew for villa project'],
  SECURITY: ['Event security — crowd management', 'Night guard coverage for site'],
  DRIVING: ['Tempo driver with licence', 'Tractor operator for farm work'],
};

const SKILLS = ['masonry', 'packing', 'loading', 'driving', 'cleaning', 'cooking', 'gardening', 'carpentry', 'painting', 'welding', 'harvesting'];
const FIRST = ['Ravi', 'Sunita', 'John', 'Aisha', 'Miguel', 'Priya', 'Kwame', 'Ana', 'Chen', 'Fatima', 'Diego', 'Leila', 'Sam', 'Nina', 'Raj', 'Grace', 'Omar', 'Tara', 'Ivan', 'Zara', 'Kofi', 'Mei', 'Pedro', 'Amina', 'Luca', 'Hina', 'Tunde', 'Sofia', 'Arun', 'Maya'];
const LAST = ['Kumar', 'Sharma', 'Okafor', 'Lopez', 'Silva', 'Patel', 'Mensah', 'Nguyen', 'Wu', 'Hassan', 'Rossi', 'Haddad', 'Lee', 'Kowalski', 'Verma', 'Adeyemi', 'Farouk', 'Singh', 'Petrov', 'Ali'];

function pick<T>(arr: T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}
function mulberry(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  await initDb();
  await runMigrations();
  const db = getDb();
  const rnd = mulberry(42);

  // Guard on the demo account specifically — journey-test users share this
  // database, so "any user exists" would falsely skip seeding.
  const existing = await db.selectFrom('users').select('id').where('email', '=', 'demo@worklink.app').executeTakeFirst();
  if (existing) {
    console.log('[seed] database already seeded — skipping (delete .db or drop schema to reseed)');
    await closeDb();
    return;
  }

  const passwordHash = await hashPassword('Worklink1');
  const userIds: string[] = [];

  // 30 users: user 0 = demo employer+worker with full profile
  for (let i = 0; i < 30; i++) {
    const id = newId();
    userIds.push(id);
    const cityInfo = CITIES[i % CITIES.length]!;
    const displayName = `${FIRST[i % FIRST.length]} ${pick(LAST, rnd)}`;
    const isDemo = i === 0;

    await db.transaction().execute(async (trx) => {
      await trx.insertInto('users').values({
        id,
        email: isDemo ? 'demo@worklink.app' : `${displayName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        phone: `+1000000${String(1000 + i)}`,
        passwordHash,
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        status: 'ACTIVE',
        isAdmin: i === 0,
      }).execute();

      await trx.insertInto('profiles').values({
        userId: id,
        displayName,
        bio: isDemo ? 'Demo account — employer and worker. Try posting a job!' : `${displayName.split(' ')[0]} — reliable, punctual, hardworking.`,
        headline: isDemo ? 'Demo employer & worker' : pick(['Skilled all-rounder', 'Construction specialist', 'Logistics pro', 'Events crew lead', 'Green thumb'], rnd),
        skills: jsonb(Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => ({
          name: pick(SKILLS, rnd),
          level: pick(['BEGINNER', 'INTERMEDIATE', 'EXPERT'], rnd),
        })) as Array<{ name: string; level: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT' }>),
        languages: jsonb([pick(['English', 'Hindi', 'Spanish', 'Yoruba', 'Tagalog'], rnd), 'English']),
        education: jsonb([] as unknown[]),
        experience: jsonb([] as unknown[]),
        currency: cityInfo.currency,
        availability: pick(['FULL_TIME', 'PART_TIME', 'WEEKENDS', 'FLEXIBLE'], rnd),
        homeLat: cityInfo.lat + (rnd() - 0.5) * 0.08,
        homeLng: cityInfo.lng + (rnd() - 0.5) * 0.08,
        homeCity: cityInfo.city,
        homeCountry: cityInfo.country,
        contactPhone: `+1000000${String(1000 + i)}`,
      }).execute();

      await trx.insertInto('userSettings').values({ userId: id }).execute();
    });
  }

  // 60 jobs spread over the last 30 days
  const jobIds: string[] = [];
  for (let i = 0; i < 60; i++) {
    const employerId = userIds[Math.floor(rnd() * 12)]!;
    const cityInfo = CITIES[Math.floor(rnd() * CITIES.length)]!;
    const category = pick([...CATEGORIES], rnd);
    const title = pick(TITLES[category]!, rnd);
    const createdAt = new Date(Date.now() - Math.floor(rnd() * 30) * 24 * 3600 * 1000 - Math.floor(rnd() * 20) * 3600 * 1000);
    const startAt = new Date(Date.now() + (1 + Math.floor(rnd() * 20)) * 24 * 3600 * 1000);
    const payType = pick(['PER_DAY', 'PER_HOUR', 'FIXED_PER_WORK'], rnd);
    const base = cityInfo.pay;
    const amount = payType === 'PER_HOUR' ? Math.max(100, Math.round(base / 8 / 10) * 10) : payType === 'PER_DAY' ? base : base * 2;
    const id = newId();
    jobIds.push(id);

    await db.insertInto('jobs').values({
      id,
      employerId,
      title,
      description: `${title}. We need dependable people for ${category.toLowerCase().replace('_', ' ')} work at ${cityInfo.city}. Reporting instructions shared after acceptance. Fair pay, same-day settlement for day work, safe working conditions. Food and water provided on site.`,
      category,
      skillsRequired: jsonb(Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => pick(SKILLS, rnd))),
      payType,
      payAmountMinor: amount * 100,
      currency: cityInfo.currency,
      negotiable: rnd() > 0.7,
      startAt,
      durationHours: payType === 'PER_HOUR' ? 4 + Math.floor(rnd() * 4) : null,
      reportingTime: '08:00',
      recurring: false,
      workersNeeded: 1 + Math.floor(rnd() * 3),
      lat: cityInfo.lat + (rnd() - 0.5) * 0.06,
      lng: cityInfo.lng + (rnd() - 0.5) * 0.06,
      addressText: `${pick(['Sector 12', 'Main Market Rd', '5th Avenue', 'Dock Road', 'Ring Rd'], rnd)}, ${cityInfo.city}`,
      city: cityInfo.city,
      country: cityInfo.country,
      showApproximateLocation: rnd() > 0.5,
      contactVisibility: 'APPLICANTS_ONLY',
      status: 'OPEN',
      expiresAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      createdAt,
    }).execute();
  }

  // Applications, assignments, reviews, chats
  for (let i = 0; i < 24; i++) {
    const jobId = jobIds[Math.floor(rnd() * jobIds.length)]!;
    const workerId = userIds[12 + Math.floor(rnd() * 18)]!;
    const status = pick(['APPLIED', 'APPLIED', 'SHORTLISTED', 'ACCEPTED', 'REJECTED'], rnd);
    try {
      await db.insertInto('applications').values({
        id: newId(),
        jobId,
        workerId,
        message: pick(['I have 3 years experience with this work.', 'Available immediately, can start tomorrow.', 'Nearby and flexible on hours.', ''], rnd),
        status,
      }).execute();
    } catch { /* unique */ }
  }

  for (let i = 0; i < 10; i++) {
    const jobId = jobIds[i]!;
    const workerId = userIds[12 + i]!;
    const assignmentId = newId();
    await db.insertInto('assignments').values({
      id: assignmentId,
      jobId,
      workerId,
      employerId: userIds[0]!,
      agreedRateMinor: 120000,
      payType: 'PER_DAY',
      currency: 'INR',
      status: pick(['SCHEDULED', 'ONGOING', 'COMPLETED', 'PAID'], rnd),
      hoursOrDaysLogged: rnd() > 0.5 ? 2 : 0,
    }).execute();

    if (i % 3 === 0) {
      await db.insertInto('dayLogs').values({
        id: newId(),
        assignmentId,
        date: new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10),
        hoursOrDays: 1,
        note: 'Full day worked',
      }).execute();
    }

    if (i % 2 === 0) {
      await db.insertInto('reviews').values({
        id: newId(),
        assignmentId,
        authorId: userIds[0]!,
        subjectId: workerId,
        rating: 4 + (i % 2),
        comment: pick(['Punctual and skilled.', 'Hardworking, would hire again.', 'Great attitude on site.'], rnd),
        tags: jsonb(['punctual', 'hardworking']),
        publishedAt: new Date(),
      }).execute();
    }
  }

  // A demo conversation
  const convId = newId();
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('conversations').values({ id: convId, jobId: jobIds[0]!, lastMessageAt: new Date() }).execute();
    await trx.insertInto('conversationMembers').values([
      { id: newId(), conversationId: convId, userId: userIds[0]! },
      { id: newId(), conversationId: convId, userId: userIds[12]! },
    ]).execute();
    await trx.insertInto('messages').values([
      { id: newId(), conversationId: convId, senderId: userIds[12], text: 'Hi! Is the warehouse loading job still available this weekend?', isSystem: false, attachments: jsonb([]) },
      { id: newId(), conversationId: convId, senderId: userIds[0], text: 'Yes — report Saturday 8am. Gate 3.', isSystem: false, attachments: jsonb([]) },
    ]).execute();
  });

  console.log('[seed] done: 30 users, 60 jobs, applications/assignments/reviews/chats');
  console.log('[seed] demo login → demo@worklink.app / Worklink1');
  await closeDb();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
