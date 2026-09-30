import { Kysely, PostgresDialect, CamelCasePlugin, sql, type Generated } from 'kysely';
import { Pool } from 'pg';
import path from 'node:path';
import { createRequire } from 'node:module';
import { env } from '../config/env.js';

// ── Database schema (Kysely type definitions) ────────────────────────────────

export interface UsersTable {
  id: string;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  googleId: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'SHADOW_BANNED' | 'DEACTIVATED';
  isAdmin: boolean;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
  deletedAt: Date | null;
}
export interface ProfilesTable {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  headline: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  skills: unknown;
  languages: unknown;
  education: unknown;
  experience: unknown;
  hourlyExpectationMinor: number | null;
  currency: Generated<string>;
  availability: Generated<string>;
  isAvailableNow: Generated<boolean>;
  homeLat: number | null;
  homeLng: number | null;
  homeCity: string | null;
  homeCountry: string | null;
  contactPhone: string | null;
  phoneVisibility: Generated<string>;
  emailVisibility: Generated<string>;
  profileVisibility: Generated<string>;
  showOnMap: Generated<boolean>;
  updatedAt: Generated<Date>;
}
export interface UserSettingsTable {
  userId: string;
  theme: Generated<string>;
  language: Generated<string>;
  currency: Generated<string>;
  notificationPrefs: Generated<unknown>;
  updatedAt: Generated<Date>;
}
export interface JobsTable {
  id: string;
  employerId: string;
  title: string;
  description: string;
  category: string;
  skillsRequired: unknown;
  payType: string;
  payAmountMinor: number;
  currency: string;
  negotiable: boolean;
  startAt: Date;
  endAt: Date | null;
  durationHours: number | null;
  reportingTime: string | null;
  recurring: boolean;
  workersNeeded: number;
  filledCount: Generated<number>;
  lat: number;
  lng: number;
  addressText: string;
  placeId: string | null;
  city: string | null;
  country: string | null;
  showApproximateLocation: boolean;
  contactPhone: string | null;
  contactVisibility: string;
  status: string;
  expiresAt: Date | null;
  searchVector: unknown;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}
export interface JobImagesTable {
  id: string;
  jobId: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
}
export interface ApplicationsTable {
  id: string;
  jobId: string;
  workerId: string;
  message: string | null;
  proposedRateMinor: number | null;
  status: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}
export interface AssignmentsTable {
  id: string;
  jobId: string;
  workerId: string;
  employerId: string;
  agreedRateMinor: number;
  payType: string;
  currency: string;
  status: string;
  startedAt: Date | null;
  completedAt: Date | null;
  hoursOrDaysLogged: Generated<number>;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}
export interface DayLogsTable {
  id: string;
  assignmentId: string;
  date: string;
  hoursOrDays: number;
  note: string | null;
  status: Generated<string>;
  createdAt: Generated<Date>;
}
export interface ReviewsTable {
  id: string;
  assignmentId: string;
  authorId: string;
  subjectId: string;
  rating: number;
  comment: string | null;
  tags: unknown;
  publishedAt: Date | null;
  createdAt: Generated<Date>;
}
export interface ConversationsTable {
  id: string;
  jobId: string | null;
  lastMessageAt: Date | null;
  createdAt: Generated<Date>;
}
export interface ConversationMembersTable {
  id: string;
  conversationId: string;
  userId: string;
  lastReadAt: Date | null;
  createdAt: Generated<Date>;
}
export interface MessagesTable {
  id: string;
  conversationId: string;
  senderId: string | null;
  text: string | null;
  attachments: unknown;
  isSystem: boolean;
  createdAt: Generated<Date>;
}
export interface MessageReadsTable {
  id: string;
  messageId: string;
  userId: string;
  readAt: Generated<Date>;
}
export interface NotificationsTable {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  linkPath: string | null;
  actorAvatarUrl: string | null;
  dedupeKey: string | null;
  readAt: Date | null;
  createdAt: Generated<Date>;
}
export interface DevicesTable {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Generated<Date>;
}
export interface SavedJobsTable {
  id: string;
  jobId: string;
  userId: string;
  createdAt: Generated<Date>;
}
export interface RefreshTokensTable {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  replacedById: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Generated<Date>;
  userAgent: string | null;
  ip: string | null;
}
export interface OtpChallengesTable {
  id: string;
  identifier: string;
  purpose: string;
  channel: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Generated<Date>;
}
export interface ReportsTable {
  id: string;
  reporterId: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: Generated<string>;
  createdAt: Generated<Date>;
  decidedAt: Date | null;
}
export interface BlocksTable {
  id: string;
  userId: string;
  blockedUserId: string;
  createdAt: Generated<Date>;
}
export interface AuditLogTable {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  createdAt: Generated<Date>;
}
export interface PaymentsTable {
  id: string;
  assignmentId: string;
  employerId: string;
  workerId: string;
  provider: string;
  providerOrderId: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  idempotencyKey: string;
  createdAt: Generated<Date>;
  updatedAt: Generated<Date>;
}
export interface PaymentEventsTable {
  id: string;
  paymentId: string | null;
  provider: string;
  eventId: string;
  type: string;
  payload: unknown;
  receivedAt: Generated<Date>;
}
export interface LedgerEntriesTable {
  id: string;
  txnId: string;
  paymentId: string | null;
  entryType: 'DEBIT' | 'CREDIT';
  account: string;
  amountMinor: number;
  currency: string;
  memo: string | null;
  createdAt: Generated<Date>;
}
export interface IdempotencyKeysTable {
  key: string;
  scope: string;
  userId: string | null;
  responseSnapshot: unknown;
  createdAt: Generated<Date>;
}
export interface SearchHistoryTable {
  id: string;
  userId: string;
  term: string;
  createdAt: Generated<Date>;
}

/** Keys are camelCase; CamelCasePlugin maps them to the snake_case SQL tables. */
export interface DB {
  users: UsersTable;
  profiles: ProfilesTable;
  userSettings: UserSettingsTable;
  jobs: JobsTable;
  jobImages: JobImagesTable;
  applications: ApplicationsTable;
  assignments: AssignmentsTable;
  dayLogs: DayLogsTable;
  reviews: ReviewsTable;
  conversations: ConversationsTable;
  conversationMembers: ConversationMembersTable;
  messages: MessagesTable;
  messageReads: MessageReadsTable;
  notifications: NotificationsTable;
  devices: DevicesTable;
  savedJobs: SavedJobsTable;
  refreshTokens: RefreshTokensTable;
  otpChallenges: OtpChallengesTable;
  reports: ReportsTable;
  blocks: BlocksTable;
  auditLog: AuditLogTable;
  payments: PaymentsTable;
  paymentEvents: PaymentEventsTable;
  ledgerEntries: LedgerEntriesTable;
  idempotencyKeys: IdempotencyKeysTable;
  searchHistory: SearchHistoryTable;
}

// ── Connection management ────────────────────────────────────────────────────

let db: Kysely<DB> | null = null;
let pool: Pool | null = null;
let stopEmbedded: (() => Promise<void>) | null = null;

export function getDb(): Kysely<DB> {
  if (!db) throw new Error('Database not initialized — call initDb() first');
  return db;
}

export function getPool(): Pool {
  if (!pool) throw new Error('Database not initialized — call initDb() first');
  return pool;
}

/** Test hook: inject an existing pool (integration tests, custom setups). */
export function setPoolForTests(p: Pool): Kysely<DB> {
  pool = p;
  db = new Kysely<DB>({ dialect: new PostgresDialect({ pool: p }), plugins: [new CamelCasePlugin()] });
  return db;
}

const PG_VERSION = '17.4';
const PG_DATA_PORT = 5433; // avoid clashing with a real Postgres on 5432

/**
 * Boot a Postgres server inside the API process when no DATABASE_URL is
 * reachable (Docker-less machines, CI without services). Data lives in
 * ./.db/data and survives restarts.
 */
async function startEmbeddedPostgres(dbName: string): Promise<{ port: number; stop: () => Promise<void> }> {
  const require = createRequire(import.meta.url);
  const mod = require('embedded-postgres');
  const EmbeddedPostgres = (mod.EmbeddedPostgres ?? mod.default?.EmbeddedPostgres ?? mod.default) as new (
    opts: Record<string, unknown>
  ) => {
    initialise: () => Promise<void>;
    start: () => Promise<void>;
    stop: () => Promise<void>;
    createDatabase: (name: string) => Promise<void>;
  };
  const dataDir = path.join(process.cwd(), '.db', 'data');

  const cluster = new EmbeddedPostgres({
    database: dbName,
    user: 'worklink',
    password: 'worklink',
    port: PG_DATA_PORT,
    persistent: true,
    dataDir,
    onLog: () => {},
    onError: (msg: string) => console.error('[pg-embedded]', msg),
    onStderr: () => {},
    onStdout: () => {},
  });

  try {
    await cluster.initialise();
  } catch {
    // already initialised from a previous run — fine
  }
  await cluster.start();
  // `embedded-postgres` binds the configured port; ensure the app DB exists.
  try {
    await cluster.createDatabase(dbName);
  } catch {
    /* already exists */
  }
  return { port: PG_DATA_PORT, stop: () => cluster.stop() };
}

/** Is DATABASE_URL usable right now? Quick fail-fast probe. */
async function probeDatabase(url: string, timeoutMs = 2500): Promise<boolean> {
  if (!url) return false;
  const probe = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: timeoutMs });
  try {
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

export async function initDb(): Promise<void> {
  if (db) return;

  let url = env.databaseUrl;
  let usedEmbedded = false;

  if (env.embeddedDb || !(await probeDatabase(url))) {
    console.log('[db] DATABASE_URL not reachable — booting embedded Postgres…');
    // Use the database name from DATABASE_URL so tests (worklink_test) get
    // their own isolated database instead of sharing the dev one.
    let dbName = 'worklink';
    try {
      const parsed = new URL(env.databaseUrl).pathname.replace(/^\//, '');
      if (parsed) dbName = parsed;
    } catch { /* keep default */ }
    const { port, stop } = await startEmbeddedPostgres(dbName);
    stopEmbedded = stop;
    url = `postgres://worklink:worklink@localhost:${port}/${dbName}`;
    usedEmbedded = true;
  }

  pool = new Pool({
    connectionString: url,
    max: env.isTest ? 5 : 10,
    idleTimeoutMillis: 30_000,
  });
  db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }), plugins: [new CamelCasePlugin()] });
  if (usedEmbedded) console.log('[db] embedded Postgres ready');
}

export async function closeDb(): Promise<void> {
  if (db) await db.destroy().catch(() => {});
  db = null;
  if (pool) await pool.end().catch(() => {});
  pool = null;
  if (stopEmbedded) await stopEmbedded().catch(() => {});
  stopEmbedded = null;
}

// ── Migrations ───────────────────────────────────────────────────────────────

/**
 * Single-file idempotent migration runner (see DECISIONS.md — chosen over
 * Prisma/Knex to keep the dependency graph light and PostGIS DDL explicit).
 */
export async function runMigrations(): Promise<void> {
  const k = getDb();
  await sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.execute(k);

  const applied = new Set(
    (await sql<{ name: string }>`SELECT name FROM _migrations`.execute(k)).rows.map((r) => r.name)
  );

  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    await k.transaction().execute(async (trx) => {
      await m.up(trx as unknown as Kysely<DB>);
      await sql`INSERT INTO _migrations (name) VALUES (${m.name})`.execute(trx as unknown as Kysely<DB>);
    });
    console.log(`[db] migration applied: ${m.name}`);
  }
}

export interface Migration {
  name: string;
  up: (db: Kysely<DB>) => Promise<void>;
}

const migrations: Migration[] = [
  {
    name: '0001_init',
    up: async (k) => {
      await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(k);
      await sql`CREATE EXTENSION IF NOT EXISTS citext`.execute(k);

      await sql`
        CREATE TABLE users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email citext,
          phone text,
          password_hash text,
          google_id text UNIQUE,
          email_verified_at timestamptz,
          phone_verified_at timestamptz,
          status text NOT NULL DEFAULT 'ACTIVE',
          is_admin boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          deleted_at timestamptz
        )
      `.execute(k);
      await sql`CREATE UNIQUE INDEX users_email_uniq ON users (email) WHERE email IS NOT NULL AND deleted_at IS NULL`.execute(k);
      await sql`CREATE UNIQUE INDEX users_phone_uniq ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL`.execute(k);
      await sql`ALTER TABLE users ADD CONSTRAINT users_ident_chk CHECK (email IS NOT NULL OR phone IS NOT NULL)`.execute(k);

      await sql`
        CREATE TABLE profiles (
          user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          display_name text NOT NULL,
          avatar_url text,
          cover_url text,
          bio text,
          headline text,
          date_of_birth date,
          gender text,
          skills jsonb NOT NULL DEFAULT '[]'::jsonb,
          languages jsonb NOT NULL DEFAULT '[]'::jsonb,
          education jsonb NOT NULL DEFAULT '[]'::jsonb,
          experience jsonb NOT NULL DEFAULT '[]'::jsonb,
          hourly_expectation_minor bigint,
          currency text NOT NULL DEFAULT 'USD',
          availability text NOT NULL DEFAULT 'FLEXIBLE',
          is_available_now boolean NOT NULL DEFAULT true,
          home_lat double precision,
          home_lng double precision,
          home_city text,
          home_country text,
          contact_phone text,
          phone_visibility text NOT NULL DEFAULT 'APPLICANTS_ONLY',
          email_visibility text NOT NULL DEFAULT 'APPLICANTS_ONLY',
          profile_visibility text NOT NULL DEFAULT 'PUBLIC',
          show_on_map boolean NOT NULL DEFAULT true,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);

      await sql`
        CREATE TABLE user_settings (
          user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          theme text NOT NULL DEFAULT 'system',
          language text NOT NULL DEFAULT 'en',
          currency text NOT NULL DEFAULT 'USD',
          notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);

      // PostGIS when available (docker image / managed DB); otherwise the
      // haversine fallback below keeps geo queries working (see DECISIONS.md).
      // Probe pg_available_extensions first — attempting CREATE EXTENSION on a
      // build without PostGIS would error and poison this whole transaction.
      const pgAvailable = (
        await sql<{ n: number }>`SELECT count(*)::int AS n FROM pg_available_extensions WHERE name = 'postgis'`.execute(k)
      ).rows[0];
      let hasPostgis = false;
      if (Number(pgAvailable?.n ?? 0) > 0) {
        try {
          await sql`CREATE EXTENSION IF NOT EXISTS postgis`.execute(k);
          hasPostgis = true;
        } catch {
          console.warn('[db] PostGIS listed as available but CREATE EXTENSION failed — using haversine fallback');
        }
      }
      if (!hasPostgis) console.warn('[db] PostGIS unavailable — using haversine geo fallback');
      // Pure-SQL haversine used when PostGIS is absent (embedded PG) and by tests
      await sql`
        CREATE OR REPLACE FUNCTION wl_distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
        RETURNS double precision AS $$
        DECLARE
          r constant double precision := 6371;
          dla double precision;
          dlo double precision;
          a double precision;
        BEGIN
          dla := radians(lat2 - lat1);
          dlo := radians(lng2 - lng1);
          a := sin(dla/2)*sin(dla/2) + cos(radians(lat1))*cos(radians(lat2))*sin(dlo/2)*sin(dlo/2);
          RETURN r * 2 * atan2(sqrt(a), sqrt(1-a));
        END;
        $$ LANGUAGE plpgsql IMMUTABLE
      `.execute(k);

      await sql`
        CREATE TABLE jobs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          employer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title text NOT NULL,
          description text NOT NULL,
          category text NOT NULL,
          skills_required jsonb NOT NULL DEFAULT '[]'::jsonb,
          pay_type text NOT NULL,
          pay_amount_minor bigint NOT NULL,
          currency text NOT NULL,
          negotiable boolean NOT NULL DEFAULT false,
          start_at timestamptz NOT NULL,
          end_at timestamptz,
          duration_hours int,
          reporting_time text,
          recurring boolean NOT NULL DEFAULT false,
          workers_needed int NOT NULL DEFAULT 1,
          filled_count int NOT NULL DEFAULT 0,
          lat double precision NOT NULL,
          lng double precision NOT NULL,
          address_text text NOT NULL,
          place_id text,
          city text,
          country text,
          show_approximate_location boolean NOT NULL DEFAULT true,
          contact_phone text,
          contact_visibility text NOT NULL DEFAULT 'APPLICANTS_ONLY',
          status text NOT NULL DEFAULT 'OPEN',
          expires_at timestamptz,
          search_vector tsvector,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);
      if (hasPostgis) {
        await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location geography(Point, 4326)`.execute(k);
        await sql`CREATE INDEX jobs_location_gix ON jobs USING GIST (location)`.execute(k);
        await sql`CREATE FUNCTION jobs_location_fill() RETURNS trigger AS $$
        BEGIN NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography; RETURN NEW; END
        $$ LANGUAGE plpgsql`.execute(k);
        await sql`CREATE TRIGGER jobs_location_fill_trigger BEFORE INSERT OR UPDATE OF lat, lng ON jobs
          FOR EACH ROW EXECUTE FUNCTION jobs_location_fill()`.execute(k);
      }
      await sql`CREATE INDEX jobs_status_start_idx ON jobs (status, start_at)`.execute(k);
      await sql`CREATE INDEX jobs_employer_idx ON jobs (employer_id, created_at DESC)`.execute(k);
      await sql`CREATE INDEX jobs_search_fts_idx ON jobs USING GIN (search_vector)`.execute(k);

      await sql`
        CREATE TABLE job_images (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          url text NOT NULL,
          width int,
          height int,
          position int NOT NULL DEFAULT 0
        )
      `.execute(k);

      await sql`
        CREATE TABLE applications (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          message text,
          proposed_rate_minor bigint,
          status text NOT NULL DEFAULT 'APPLIED',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (job_id, worker_id)
        )
      `.execute(k);
      await sql`CREATE INDEX applications_worker_idx ON applications (worker_id, created_at DESC)`.execute(k);

      await sql`
        CREATE TABLE assignments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          employer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          agreed_rate_minor bigint NOT NULL,
          pay_type text NOT NULL,
          currency text NOT NULL,
          status text NOT NULL DEFAULT 'SCHEDULED',
          started_at timestamptz,
          completed_at timestamptz,
          hours_or_days_logged numeric NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);
      await sql`CREATE INDEX assignments_worker_idx ON assignments (worker_id, created_at DESC)`.execute(k);
      await sql`CREATE INDEX assignments_employer_idx ON assignments (employer_id, created_at DESC)`.execute(k);

      await sql`
        CREATE TABLE day_logs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
          date date NOT NULL,
          hours_or_days numeric NOT NULL,
          note text,
          status text NOT NULL DEFAULT 'PENDING',
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (assignment_id, date)
        )
      `.execute(k);

      await sql`
        CREATE TABLE reviews (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
          author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          subject_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
          comment text,
          tags jsonb NOT NULL DEFAULT '[]'::jsonb,
          published_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (assignment_id, author_id)
        )
      `.execute(k);
      await sql`CREATE INDEX reviews_subject_idx ON reviews (subject_id, published_at DESC)`.execute(k);

      await sql`
        CREATE TABLE conversations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
          last_message_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);
      await sql`
        CREATE TABLE conversation_members (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          last_read_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (conversation_id, user_id)
        )
      `.execute(k);
      await sql`
        CREATE TABLE messages (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
          text text,
          attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
          is_system boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);
      await sql`CREATE INDEX messages_conv_idx ON messages (conversation_id, created_at DESC)`.execute(k);
      await sql`
        CREATE TABLE message_reads (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          read_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (message_id, user_id)
        )
      `.execute(k);

      await sql`
        CREATE TABLE notifications (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          type text NOT NULL,
          title text NOT NULL,
          body text NOT NULL,
          link_path text,
          actor_avatar_url text,
          dedupe_key text,
          read_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);
      await sql`CREATE UNIQUE INDEX notifications_dedupe_uniq ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`.execute(k);
      await sql`CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC)`.execute(k);

      await sql`
        CREATE TABLE devices (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          endpoint text NOT NULL UNIQUE,
          p256dh text NOT NULL,
          auth text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);

      await sql`
        CREATE TABLE saved_jobs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (job_id, user_id)
        )
      `.execute(k);

      await sql`
        CREATE TABLE refresh_tokens (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          family_id uuid NOT NULL,
          replaced_by_id uuid,
          expires_at timestamptz NOT NULL,
          revoked_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now(),
          user_agent text,
          ip inet
        )
      `.execute(k);

      await sql`
        CREATE TABLE otp_challenges (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          identifier text NOT NULL,
          purpose text NOT NULL,
          channel text NOT NULL,
          code_hash text NOT NULL,
          attempts int NOT NULL DEFAULT 0,
          max_attempts int NOT NULL DEFAULT 5,
          expires_at timestamptz NOT NULL,
          consumed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);
      await sql`CREATE INDEX otp_identifier_idx ON otp_challenges (identifier, purpose, created_at DESC)`.execute(k);

      await sql`
        CREATE TABLE reports (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          target_type text NOT NULL,
          target_id uuid NOT NULL,
          reason text NOT NULL,
          details text,
          status text NOT NULL DEFAULT 'PENDING',
          created_at timestamptz NOT NULL DEFAULT now(),
          decided_at timestamptz
        )
      `.execute(k);

      await sql`
        CREATE TABLE blocks (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (user_id, blocked_user_id)
        )
      `.execute(k);

      await sql`
        CREATE TABLE audit_log (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          actor_id uuid,
          action text NOT NULL,
          target_type text,
          target_id text,
          meta jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);

      await sql`
        CREATE TABLE payments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          assignment_id uuid NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
          employer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          worker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          provider text NOT NULL,
          provider_order_id text,
          amount_minor bigint NOT NULL,
          currency text NOT NULL,
          status text NOT NULL DEFAULT 'PENDING',
          idempotency_key text NOT NULL UNIQUE,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);

      await sql`
        CREATE TABLE payment_events (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
          provider text NOT NULL,
          event_id text NOT NULL,
          type text NOT NULL,
          payload jsonb NOT NULL,
          received_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (provider, event_id)
        )
      `.execute(k);

      await sql`
        CREATE TABLE ledger_entries (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          txn_id uuid NOT NULL,
          payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
          entry_type text NOT NULL CHECK (entry_type IN ('DEBIT','CREDIT')),
          account text NOT NULL,
          amount_minor bigint NOT NULL,
          currency text NOT NULL,
          memo text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);
      await sql`CREATE INDEX ledger_txn_idx ON ledger_entries (txn_id)`.execute(k);

      await sql`
        CREATE TABLE idempotency_keys (
          key text NOT NULL,
          scope text NOT NULL,
          user_id uuid,
          response_snapshot jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (key, scope)
        )
      `.execute(k);

      await sql`
        CREATE TABLE search_history (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          term text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `.execute(k);

      // Full-text search: trigger keeps search_vector = title + description + skills
      await sql`
        CREATE FUNCTION jobs_search_vector_update() RETURNS trigger AS $$
        BEGIN
          NEW.search_vector :=
            setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
            setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B') ||
            setweight(to_tsvector('simple', coalesce(NEW.category, '')), 'C') ||
            setweight(to_tsvector('simple', coalesce(array_to_string(ARRAY(SELECT jsonb_array_elements_text(NEW.skills_required)), ' '), '')), 'B');
          RETURN NEW;
        END
        $$ LANGUAGE plpgsql
      `.execute(k);
      await sql`
        CREATE TRIGGER jobs_search_vector_trigger BEFORE INSERT OR UPDATE OF title, description, category, skills_required
        ON jobs FOR EACH ROW EXECUTE FUNCTION jobs_search_vector_update()
      `.execute(k);
    },
  },
];
