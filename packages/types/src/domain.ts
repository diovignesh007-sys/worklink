/**
 * WorkLink core domain types.
 *
 * Money rule: every monetary amount is an integer in minor units (paise,
 * cents…) plus an ISO-4217 currency code. Never floats.
 * Time rule: everything is stored/transmitted as UTC ISO-8601 strings.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Enums ────────────────────────────────────────────────────────────────────

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'SHADOW_BANNED' | 'DEACTIVATED';

export type PayType = 'PER_HOUR' | 'PER_DAY' | 'FIXED_PER_WORK';

export type JobStatus = 'DRAFT' | 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export type ApplicationStatus = 'APPLIED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';

export type AssignmentStatus =
  | 'SCHEDULED'
  | 'ONGOING'
  | 'COMPLETED'
  | 'PAID'
  | 'DISPUTED'
  | 'CANCELLED';

export type JobCategory =
  | 'CONSTRUCTION'
  | 'WAREHOUSE'
  | 'DELIVERY'
  | 'CLEANING'
  | 'AGRICULTURE'
  | 'EVENTS'
  | 'MOVING_PACKING'
  | 'KITCHEN_HELP'
  | 'GARDENING'
  | 'SECURITY'
  | 'DRIVING'
  | 'OTHER';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export type Availability = 'FULL_TIME' | 'PART_TIME' | 'WEEKENDS' | 'EVENINGS' | 'FLEXIBLE';

export type FieldVisibility = 'PUBLIC' | 'APPLICANTS_ONLY' | 'PRIVATE';

export type OtpPurpose =
  | 'EMAIL_VERIFY'
  | 'PHONE_VERIFY'
  | 'PASSWORD_RESET'
  | 'LOGIN'
  | 'EMAIL_CHANGE'
  | 'PHONE_CHANGE';

export type OtpChannelKind = 'EMAIL' | 'SMS';

export type NotificationType =
  | 'NEW_MATCHING_JOB'
  | 'NEW_APPLICATION'
  | 'APPLICATION_SHORTLISTED'
  | 'APPLICATION_ACCEPTED'
  | 'APPLICATION_REJECTED'
  | 'ASSIGNMENT_STARTING_TOMORROW'
  | 'WORK_MARKED_COMPLETE'
  | 'REVIEW_RECEIVED'
  | 'PAYMENT_RECEIVED'
  | 'MESSAGE_NEW'
  | 'SYSTEM';

export type PaymentStatus =
  | 'PENDING'
  | 'AUTHORIZED'
  | 'HELD'
  | 'RELEASED'
  | 'REFUNDED'
  | 'FAILED'
  | 'DISPUTE_HOLD';

export type ReportTargetType = 'USER' | 'JOB' | 'MESSAGE' | 'CONVERSATION';

export type ReportStatus = 'PENDING' | 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED';

export type FeedTab = 'nearby' | 'matched' | 'all';

export type ApplicationAction = 'SHORTLIST' | 'ACCEPT' | 'REJECT' | 'WITHDRAW';

// ── Geo & money primitives ───────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Money {
  amountMinor: number;
  currency: string; // ISO-4217, e.g. "INR", "USD"
}

// ── User & profile ───────────────────────────────────────────────────────────

export interface PublicProfile {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  headline: string | null;
  bio: string | null;
  city: string | null;
  country: string | null;
  skills: string[];
  languages: string[];
  ratingAvg: number | null;
  ratingCount: number;
  completedJobs: number;
  isVerified: boolean;
  role: 'EMPLOYER' | 'WORKER' | 'BOTH';
  memberSince: string;
}

export interface ProfileStats {
  ratingAvg: number | null;
  ratingCount: number;
  completedJobs: number;
  jobsPosted: number;
  totalEarnedMinor: number | null;
  totalEarnedCurrency: string | null;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  year?: string;
}

export interface ExperienceEntry {
  title: string;
  employer: string;
  from: string;
  to?: string;
  description?: string;
}

export interface SkillEntry {
  name: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'EXPERT';
}

export interface SelfUser {
  id: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: UserStatus;
  createdAt: string;
  profile: UserProfile;
  settings: UserSettings;
}

export interface UserProfile {
  displayName: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  bio: string | null;
  headline: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  skills: SkillEntry[];
  languages: string[];
  education: EducationEntry[];
  experience: ExperienceEntry[];
  hourlyExpectationMinor: number | null;
  currency: string;
  availability: Availability;
  homeCity: string | null;
  homeCountry: string | null;
  homeLocation: LatLng | null;
  contactPhone: string | null;
  contactVisibility: Record<'phone' | 'email', FieldVisibility>;
  isAvailableNow: boolean;
}

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  currency: string;
  notifications: NotificationPrefs;
  privacy: {
    profileVisibility: 'PUBLIC' | 'PRIVATE';
    showOnMap: boolean;
  };
}

/** Partially-specified settings patch (client → PATCH /users/me/settings). */
export interface UpdateSettingsInput {
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  currency?: string;
  notifications?: {
    inApp?: Partial<Record<NotificationType, boolean>>;
    email?: Partial<Record<NotificationType, boolean>>;
    push?: Partial<Record<NotificationType, boolean>>;
    dailyDigest?: boolean;
  };
  privacy?: {
    profileVisibility?: 'PUBLIC' | 'PRIVATE';
    showOnMap?: boolean;
  };
}

export interface NotificationPrefs {
  inApp: Record<NotificationType, boolean>;
  email: Partial<Record<NotificationType, boolean>>;
  push: Partial<Record<NotificationType, boolean>>;
  dailyDigest: boolean;
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

export interface JobImage {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  position: number;
}

export interface JobSummary {
  id: string;
  title: string;
  category: JobCategory;
  payType: PayType;
  payAmountMinor: number;
  currency: string;
  negotiable: boolean;
  startAt: string;
  durationDays: number | null;
  city: string | null;
  imageUrl: string | null;
  distanceKm: number | null;
  workersNeeded: number;
  filledCount: number;
  createdAt: string;
  status: JobStatus;
  employer: Pick<PublicProfile, 'id' | 'displayName' | 'avatarUrl' | 'isVerified' | 'ratingAvg' | 'ratingCount'>;
}

export interface JobDetail extends JobSummary {
  description: string;
  skillsRequired: string[];
  endAt: string | null;
  reportingTime: string | null;
  status: JobStatus;
  expiresAt: string | null;
  addressText: string | null;
  approximateLocation: LatLng | null;
  contactVisibility: FieldVisibility;
  images: JobImage[];
  viewerRelationship?: {
    hasApplied: boolean;
    applicationStatus: ApplicationStatus | null;
    saved: boolean;
    isOwner: boolean;
  };
}

export interface CreateJobInput {
  title: string;
  description: string;
  category: JobCategory;
  skillsRequired: string[];
  workersNeeded: number;
  startAt: string;
  durationDays?: number | null;
  durationHours?: number | null;
  reportingTime?: string | null;
  recurring: boolean;
  payType: PayType;
  payAmountMinor: number;
  currency: string;
  negotiable: boolean;
  location: LatLng;
  addressText: string;
  placeId?: string | null;
  city?: string | null;
  country?: string | null;
  showApproximateLocation: boolean;
  contactPhone?: string | null;
  contactVisibility: FieldVisibility;
  imageUrls: string[];
  publish: boolean;
}

export type UpdateJobInput = Partial<CreateJobInput>;

export interface JobFilters {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  category?: JobCategory;
  payType?: PayType;
  minPay?: number;
  maxPay?: number;
  startAfter?: string;
  hiringNow?: boolean;
  sort?: 'relevance' | 'recent' | 'pay' | 'distance';
}

// ── Applications & assignments ───────────────────────────────────────────────

export interface ApplicationView {
  id: string;
  jobId: string;
  jobTitle: string;
  jobStatus: JobStatus;
  worker: Pick<PublicProfile, 'id' | 'displayName' | 'avatarUrl' | 'isVerified' | 'ratingAvg' | 'ratingCount' | 'skills'>;
  message: string | null;
  proposedRateMinor: number | null;
  currency: string;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerApplicationView {
  id: string;
  jobId: string;
  jobTitle: string;
  jobPayType: PayType;
  jobPayAmountMinor: number;
  currency: string;
  jobStartAt: string;
  jobCity: string | null;
  jobImageUrl: string | null;
  status: ApplicationStatus;
  createdAt: string;
}

export interface DayLog {
  id: string;
  date: string;
  hoursOrDays: number;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface AssignmentView {
  id: string;
  jobId: string;
  jobTitle: string;
  jobImageUrl: string | null;
  worker: Pick<PublicProfile, 'id' | 'displayName' | 'avatarUrl' | 'isVerified' | 'ratingAvg'>;
  employer: Pick<PublicProfile, 'id' | 'displayName' | 'avatarUrl' | 'isVerified' | 'ratingAvg'>;
  agreedRateMinor: number;
  payType: PayType;
  currency: string;
  status: AssignmentStatus;
  startedAt: string | null;
  completedAt: string | null;
  hoursOrDaysLogged: number;
  paymentStatus: PaymentStatus | null;
  logs: DayLog[];
  viewerRole: 'EMPLOYER' | 'WORKER';
  conversationId: string | null;
  review: { byViewer: boolean; byOther: boolean } | null;
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export const REVIEW_TAGS = [
  'punctual',
  'skilled',
  'hardworking',
  'polite',
  'fair_pay',
  'clear_instructions',
  'safe_site',
  'on_time_payment',
] as const;

export type ReviewTag = (typeof REVIEW_TAGS)[number];

export interface ReviewView {
  id: string;
  assignmentId: string;
  author: Pick<PublicProfile, 'id' | 'displayName' | 'avatarUrl' | 'isVerified'>;
  subjectId: string;
  rating: number;
  comment: string | null;
  tags: ReviewTag[];
  publishedAt: string | null;
  hiddenUntilMutual: boolean;
}

// ── Feed ─────────────────────────────────────────────────────────────────────

export interface FeedPost {
  job: JobSummary;
  saved: boolean;
  applied: boolean;
  reason: 'nearby' | 'matched' | 'recent' | 'following';
}

export interface FeedResponse {
  data: FeedPost[];
  meta: { nextCursor: string | null; newCount?: number };
}

// ── Chat ─────────────────────────────────────────────────────────────────────

export interface ConversationView {
  id: string;
  job: { id: string; title: string } | null;
  members: Array<Pick<PublicProfile, 'id' | 'displayName' | 'avatarUrl'>>;
  lastMessage: { id: string; text: string; senderId: string; createdAt: string; isSystem: boolean } | null;
  unreadCount: number;
  updatedAt: string;
}

export interface MessageView {
  id: string;
  conversationId: string;
  senderId: string | null;
  text: string | null;
  attachments: Array<{ url: string; kind: 'IMAGE' }>;
  isSystem: boolean;
  readBy: string[];
  createdAt: string;
}

export interface SendMessageInput {
  text?: string;
  attachmentUrls?: string[];
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  linkPath: string | null;
  actorAvatarUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface SearchPeopleFilters {
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  minRating?: number;
  skill?: string;
}

// ── Payments ─────────────────────────────────────────────────────────────────

export interface PaymentIntentInput {
  assignmentId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}

export interface PaymentView {
  id: string;
  assignmentId: string;
  provider: string;
  providerOrderId: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  createdAt: string;
}

export interface LedgerEntryView {
  id: string;
  txnId: string;
  entryType: 'DEBIT' | 'CREDIT';
  account: string;
  amountMinor: number;
  currency: string;
  memo: string | null;
  createdAt: string;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export interface ReportView {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  reporter: Pick<PublicProfile, 'id' | 'displayName'>;
  status: ReportStatus;
  createdAt: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthSession {
  accessToken: string;
  user: SelfUser;
}

export interface SignupInput {
  displayName: string;
  email?: string;
  phone?: string;
  password: string;
  identifier?: string;
}

export interface LoginInput {
  identifier: string;
  password: string;
}

export interface OtpRequest {
  challengeId: string;
  code: string;
}
