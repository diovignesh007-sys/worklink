import type {
  ApplicationAction,
  ApplicationView,
  AuthSession,
  AssignmentView,
  ConversationView,
  CreateJobInput,
  DayLog,
  FeedResponse,
  FeedTab,
  JobDetail,
  JobFilters,
  JobSummary,
  LedgerEntryView,
  MessageView,
  NotificationView,
  PaymentIntentInput,
  PaymentView,
  PublicProfile,
  ReportView,
  ReviewView,
  SearchPeopleFilters,
  SelfUser,
  SendMessageInput,
  UpdateJobInput,
  UpdateSettingsInput,
  UserSettings,
  WorkerApplicationView,
} from './domain.js';
import type { ApiErrorBody, ListResponse, ERROR_CODES } from './api.js';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

export class WorkLinkClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getToken: () => string | null = () => null
  ) {}

  private async req<T>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown; idempotencyKey?: string } = {}
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const res = await fetch(url.toString(), {
      method,
      headers,
      body,
      credentials: 'include',
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = (json as ApiErrorBody).error;
      throw new ApiError(res.status, err?.code ?? 'INTERNAL', err?.message ?? res.statusText, err?.details);
    }
    return json as T;
  }

  // ── Health ──────────────────────────────────────────────────────────────
  health() {
    return this.req<{ status: string }>('GET', '/health');
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  signup(input: { displayName: string; email?: string; phone?: string; password: string }) {
    return this.req<{ challengeId: string; channel: string; devCode?: string }>('POST', '/auth/signup', { body: input });
  }
  verifyOtp(input: { challengeId: string; code: string }) {
    return this.req<AuthSession>('POST', '/auth/verify-otp', { body: input });
  }
  resendOtp(input: { challengeId: string }) {
    return this.req<{ challengeId: string; devCode?: string }>('POST', '/auth/resend-otp', { body: input });
  }
  login(input: { identifier: string; password: string }) {
    return this.req<AuthSession>('POST', '/auth/login', { body: input });
  }
  logout() {
    return this.req<{ ok: boolean }>('POST', '/auth/logout');
  }
  logoutAll() {
    return this.req<{ ok: boolean }>('POST', '/auth/logout-all');
  }
  forgotPassword(input: { identifier: string }) {
    return this.req<{ challengeId: string; channel: string; devCode?: string }>('POST', '/auth/forgot-password', { body: input });
  }
  resetPassword(input: { challengeId: string; code: string; newPassword: string }) {
    return this.req<{ ok: boolean }>('POST', '/auth/reset-password', { body: input });
  }

  // ── Users / profile / settings ──────────────────────────────────────────
  me() {
    return this.req<SelfUser>('GET', '/users/me');
  }
  getUser(id: string) {
    return this.req<PublicProfile>('GET', `/users/${id}`);
  }
  getUserReviews(id: string, cursor?: string) {
    return this.req<ListResponse<ReviewView>>('GET', `/users/${id}/reviews`, { query: { cursor } });
  }
  updateMe(input: Record<string, unknown>) {
    return this.req<SelfUser>('PATCH', '/users/me', { body: input });
  }
  updateSettings(input: UpdateSettingsInput) {
    return this.req<UserSettings>('PATCH', '/users/me/settings', { body: input });
  }
  uploadUrl(input: { filename: string; contentType: string; sizeBytes: number; purpose: 'AVATAR' | 'COVER' | 'JOB' | 'CHAT' | 'PORTFOLIO' }) {
    return this.req<{ objectKey: string; uploadUrl: string; publicUrl: string; headers?: Record<string, string> }>(
      'POST',
      '/uploads/presign',
      { body: input }
    );
  }
  confirmUpload(objectKey: string) {
    return this.req<{ url: string }>('POST', '/uploads/confirm', { body: { objectKey } });
  }
  changePassword(input: { currentPassword: string; newPassword: string }) {
    return this.req<{ ok: boolean }>('POST', '/users/me/password', { body: input });
  }
  deactivateAccount() {
    return this.req<{ ok: boolean }>('POST', '/users/me/deactivate');
  }

  // ── Jobs ────────────────────────────────────────────────────────────────
  createJob(input: CreateJobInput) {
    return this.req<JobDetail>('POST', '/jobs', { body: input });
  }
  listJobs(filters: JobFilters & { cursor?: string; limit?: number }) {
    return this.req<ListResponse<JobSummary>>('GET', '/jobs', { query: { ...filters } as Query });
  }
  getJob(id: string) {
    return this.req<JobDetail>('GET', `/jobs/${id}`);
  }
  updateJob(id: string, input: UpdateJobInput) {
    return this.req<JobDetail>('PATCH', `/jobs/${id}`, { body: input });
  }
  closeJob(id: string) {
    return this.req<JobDetail>('POST', `/jobs/${id}/close`);
  }
  jobApplications(id: string, cursor?: string) {
    return this.req<ListResponse<ApplicationView>>('GET', `/jobs/${id}/applications`, { query: { cursor } });
  }
  myPosts() {
    return this.req<ListResponse<JobSummary>>('GET', '/me/jobs');
  }

  // ── Feed / saved ────────────────────────────────────────────────────────
  feed(tab: FeedTab, opts: { lat?: number; lng?: number; cursor?: string; limit?: number } = {}) {
    return this.req<FeedResponse>('GET', '/feed', { query: { tab, ...opts } as Query });
  }
  toggleSaveJob(jobId: string) {
    return this.req<{ saved: boolean }>('POST', `/jobs/${jobId}/save`);
  }
  savedJobs() {
    return this.req<ListResponse<JobSummary>>('GET', '/me/saved-jobs');
  }

  // ── Applications / assignments / reviews ────────────────────────────────
  apply(jobId: string, input: { message?: string; proposedRateMinor?: number }) {
    return this.req<{ id: string; status: string }>('POST', `/jobs/${jobId}/apply`, { body: input });
  }
  applicationAction(applicationId: string, action: ApplicationAction) {
    return this.req<{ id: string; status: string }>('PATCH', `/applications/${applicationId}`, {
      body: { action },
    });
  }
  myApplications(status?: string) {
    return this.req<WorkerApplicationView[]>('GET', '/me/applications', { query: { status } as Query });
  }
  myAssignments() {
    return this.req<AssignmentView[]>('GET', '/me/assignments');
  }
  submitLog(assignmentId: string, input: { date: string; hoursOrDays: number; note?: string }) {
    return this.req<DayLog>('POST', `/assignments/${assignmentId}/logs`, { body: input });
  }
  decideLog(assignmentId: string, logId: string, decision: 'APPROVE' | 'REJECT') {
    return this.req<DayLog>('POST', `/assignments/${assignmentId}/logs/${logId}/decision`, { body: { decision } });
  }
  completeAssignment(assignmentId: string) {
    return this.req<AssignmentView>('POST', `/assignments/${assignmentId}/complete`);
  }
  submitReview(assignmentId: string, input: { rating: number; comment?: string; tags?: string[] }) {
    return this.req<ReviewView>('POST', `/assignments/${assignmentId}/reviews`, { body: input });
  }
  reviewState(assignmentId: string) {
    return this.req<{ byViewer: boolean; byOther: boolean } | null>('GET', `/assignments/${assignmentId}/review-state`);
  }

  // ── Search ──────────────────────────────────────────────────────────────
  searchJobs(query: JobFilters & { cursor?: string; limit?: number }) {
    return this.req<ListResponse<JobSummary>>('GET', '/search/jobs', { query: { ...query } as Query });
  }
  searchPeople(query: SearchPeopleFilters & { cursor?: string; limit?: number }) {
    return this.req<ListResponse<PublicProfile>>('GET', '/search/people', { query: { ...query } as Query });
  }

  // ── Chat ────────────────────────────────────────────────────────────────
  conversations() {
    return this.req<ConversationView[]>('GET', '/conversations');
  }
  conversationMessages(id: string, cursor?: string) {
    return this.req<ListResponse<MessageView>>('GET', `/conversations/${id}/messages`, { query: { cursor } });
  }
  createConversation(jobId: string, peerUserId: string) {
    return this.req<{ id: string }>('POST', '/conversations', { body: { jobId, peerUserId } });
  }
  sendMessage(conversationId: string, input: SendMessageInput) {
    return this.req<MessageView>('POST', `/conversations/${conversationId}/messages`, { body: input });
  }
  markRead(conversationId: string) {
    return this.req<{ ok: boolean }>('POST', `/conversations/${conversationId}/read`);
  }

  // ── Notifications / devices ─────────────────────────────────────────────
  notifications(cursor?: string) {
    return this.req<ListResponse<NotificationView>>('GET', '/notifications', { query: { cursor } });
  }
  markNotificationsRead(ids: string[]) {
    return this.req<{ ok: boolean }>('POST', '/notifications/read', { body: { ids } });
  }
  registerDevice(input: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    return this.req<{ ok: boolean }>('POST', '/devices', { body: input });
  }

  // ── Safety: report / block ──────────────────────────────────────────────
  report(input: { targetType: string; targetId: string; reason: string; details?: string }) {
    return this.req<{ id: string }>('POST', '/reports', { body: input });
  }
  block(userId: string) {
    return this.req<{ ok: boolean }>('POST', '/blocks', { body: { userId } });
  }
  unblock(userId: string) {
    return this.req<{ ok: boolean }>('POST', '/blocks/unblock', { body: { userId } });
  }
  blockedUsers() {
    return this.req<Array<{ id: string; displayName: string; avatarUrl: string | null }>>('GET', '/blocks');
  }

  // ── Payments (phase 7) ──────────────────────────────────────────────────
  paymentsEnabled() {
    return this.req<{ enabled: boolean; provider: string }>('GET', '/payments/config');
  }
  createPaymentIntent(input: PaymentIntentInput) {
    return this.req<PaymentView & { checkout?: unknown }>('POST', '/payments/intent', { body: input });
  }
  releasePayment(paymentId: string) {
    return this.req<PaymentView>('POST', `/payments/${paymentId}/release`);
  }
  assignmentPayments(assignmentId: string) {
    return this.req<{ payments: PaymentView[]; ledger: LedgerEntryView[] }>(
      'GET',
      `/assignments/${assignmentId}/payments`
    );
  }
  myEarnings() {
    return this.req<{ totalEarnedMinor: number; currency: string; entries: LedgerEntryView[] }>('GET', '/me/earnings');
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  adminReports(status?: string) {
    return this.req<ListResponse<ReportView>>('GET', '/admin/reports', { query: { status } as Query });
  }
  adminDecideReport(reportId: string, decision: 'DISMISS' | 'ACTION') {
    return this.req<{ id: string; status: string }>('POST', `/admin/reports/${reportId}/decision`, {
      body: { decision },
    });
  }
  adminSetUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'SHADOW_BANNED') {
    return this.req<{ id: string; status: string }>('POST', `/admin/users/${userId}/status`, { body: { status } });
  }

  // ── OpenAPI ─────────────────────────────────────────────────────────────
  openapi() {
    return this.req<Record<string, unknown>>('GET', '/openapi.json');
  }
}

export type { ERROR_CODES };
