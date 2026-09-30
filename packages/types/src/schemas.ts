import { z } from 'zod';

/**
 * Shared zod schemas — used by the API for request validation and by the web
 * app for form validation. Single source of truth per the spec (§5.6).
 */

export const uuidSchema = z.string().uuid();

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const phoneRe = /^\+[1-9]\d{6,14}$/; // E.164

export const signupSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().regex(phoneRe, 'Phone must be E.164, e.g. +919876543210').optional(),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .max(128)
      .regex(/[a-z]/, 'Needs a lowercase letter')
      .regex(/[A-Z0-9]/, 'Needs an uppercase letter or digit'),
  })
  .refine((v) => Boolean(v.email || v.phone), { message: 'Email or phone is required' });

export const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(128),
});

export const verifyOtpSchema = z.object({
  challengeId: z.union([z.literal('auto'), z.string().min(8).max(64)]),
  code: z.string().regex(/^\d{6}$/, '6-digit code'),
});

export const resendOtpSchema = z.object({
  challengeId: z.string().min(8).max(64),
});

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(10).max(128),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/, 'Needs a lowercase letter')
    .regex(/[A-Z0-9]/, 'Needs an uppercase letter or digit'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z0-9]/),
});

export const skillEntrySchema = z.object({
  name: z.string().trim().min(1).max(40),
  level: z.enum(['BEGINNER', 'INTERMEDIATE', 'EXPERT']),
});

export const educationEntrySchema = z.object({
  institution: z.string().trim().min(1).max(120),
  degree: z.string().trim().min(1).max(120),
  year: z.string().trim().max(10).optional(),
});

export const experienceEntrySchema = z.object({
  title: z.string().trim().min(1).max(120),
  employer: z.string().trim().min(1).max(120),
  from: z.string().trim().max(20),
  to: z.string().trim().max(20).optional(),
  description: z.string().trim().max(500).optional(),
});

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(80).optional(),
  headline: z.string().trim().max(120).optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional().nullable(),
  skills: z.array(skillEntrySchema).max(30).optional(),
  languages: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  education: z.array(educationEntrySchema).max(20).optional(),
  experience: z.array(experienceEntrySchema).max(20).optional(),
  hourlyExpectationMinor: z.number().int().min(0).max(10_000_000).optional().nullable(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  availability: z.enum(['FULL_TIME', 'PART_TIME', 'WEEKENDS', 'EVENINGS', 'FLEXIBLE']).optional(),
  isAvailableNow: z.boolean().optional(),
  homeLocation: latLngSchema.optional().nullable(),
  homeCity: z.string().trim().max(120).optional().nullable(),
  homeCountry: z.string().trim().max(2).toUpperCase().optional().nullable(),
  contactPhone: z.string().regex(phoneRe).optional().nullable(),
  contactVisibility: z
    .object({ phone: z.enum(['PUBLIC', 'APPLICANTS_ONLY', 'PRIVATE']), email: z.enum(['PUBLIC', 'APPLICANTS_ONLY', 'PRIVATE']) })
    .optional(),
  coverUrl: z.string().url().max(500).optional().nullable(),
});

export const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().trim().min(2).max(10).optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  notifications: z
    .object({
      inApp: z.record(z.boolean()).optional(),
      email: z.record(z.boolean()).optional(),
      push: z.record(z.boolean()).optional(),
      dailyDigest: z.boolean().optional(),
    })
    .optional(),
  privacy: z
    .object({
      profileVisibility: z.enum(['PUBLIC', 'PRIVATE']).optional(),
      showOnMap: z.boolean().optional(),
    })
    .optional(),
});

export const createJobSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(4000),
  category: z.enum([
    'CONSTRUCTION',
    'WAREHOUSE',
    'DELIVERY',
    'CLEANING',
    'AGRICULTURE',
    'EVENTS',
    'MOVING_PACKING',
    'KITCHEN_HELP',
    'GARDENING',
    'SECURITY',
    'DRIVING',
    'OTHER',
  ]),
  skillsRequired: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  workersNeeded: z.number().int().min(1).max(100),
  startAt: z.string().datetime({ offset: true }),
  durationDays: z.number().int().min(1).max(365).optional().nullable(),
  durationHours: z.number().int().min(1).max(24 * 30).optional().nullable(),
  reportingTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  recurring: z.boolean().default(false),
  payType: z.enum(['PER_HOUR', 'PER_DAY', 'FIXED_PER_WORK']),
  payAmountMinor: z.number().int().min(0),
  currency: z.string().trim().length(3).toUpperCase(),
  negotiable: z.boolean().default(false),
  location: latLngSchema,
  addressText: z.string().trim().min(3).max(300),
  placeId: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(2).toUpperCase().optional().nullable(),
  showApproximateLocation: z.boolean().default(true),
  contactPhone: z.string().regex(phoneRe).optional().nullable(),
  contactVisibility: z.enum(['PUBLIC', 'APPLICANTS_ONLY', 'PRIVATE']).default('APPLICANTS_ONLY'),
  imageUrls: z.array(z.string().url().max(500)).max(5).default([]),
  publish: z.boolean().default(true),
});

export const updateJobSchema = createJobSchema.partial();

export const applySchema = z.object({
  message: z.string().trim().max(1000).optional().nullable(),
  proposedRateMinor: z.number().int().min(0).optional().nullable(),
});

export const applicationActionSchema = z.object({
  action: z.enum(['SHORTLIST', 'ACCEPT', 'REJECT', 'WITHDRAW']),
});

export const createLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hoursOrDays: z.number().min(0.5).max(24),
  note: z.string().trim().max(300).optional().nullable(),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().nullable(),
  tags: z
    .array(z.enum(['punctual', 'skilled', 'hardworking', 'polite', 'fair_pay', 'clear_instructions', 'safe_site', 'on_time_payment']))
    .max(4)
    .default([]),
});

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000).optional(),
  attachmentUrls: z.array(z.string().url().max(500)).max(5).optional(),
});

export const createConversationSchema = z.object({
  jobId: uuidSchema,
  peerUserId: uuidSchema,
});

export const searchJobsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(0.5).max(500).optional(),
  category: z.string().optional(),
  payType: z.enum(['PER_HOUR', 'PER_DAY', 'FIXED_PER_WORK']).optional(),
  minPay: z.coerce.number().int().min(0).optional(),
  maxPay: z.coerce.number().int().min(0).optional(),
  startAfter: z.string().datetime({ offset: true }).optional(),
  hiringNow: z.enum(['0', '1']).optional(),
  sort: z.enum(['relevance', 'recent', 'pay', 'distance']).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const reportSchema = z.object({
  targetType: z.enum(['USER', 'JOB', 'MESSAGE', 'CONVERSATION']),
  targetId: uuidSchema,
  reason: z.enum(['SPAM', 'SCAM', 'FAKE_JOB', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER']),
  details: z.string().trim().max(1000).optional().nullable(),
});

export const blockSchema = z.object({
  userId: uuidSchema,
});

export const paymentIntentSchema = z.object({
  assignmentId: uuidSchema,
  amountMinor: z.number().int().min(1),
  currency: z.string().trim().length(3).toUpperCase(),
  idempotencyKey: z.string().trim().min(8).max(64),
});

export const deviceRegisterSchema = z.object({
  endpoint: z.string().url().max(500),
  keys: z.object({ p256dh: z.string().max(300), auth: z.string().max(300) }),
});

export const avatarSchema = z.object({
  objectKey: z.string().trim().min(3).max(300),
});

export const feedQuerySchema = z.object({
  tab: z.enum(['nearby', 'matched', 'all']).default('nearby'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(30).optional(),
});
