import { resolveApiBaseUrl } from '../lib/apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);

function buildHeaders(token?: string, json = false): HeadersInit {
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function safeFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.message || 'Request failed');
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export interface AdminProfile {
  userId: string;
  email: string;
  username: string;
  role: 'super_admin';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export type AdminDashboardRange = '7d' | '30d' | '90d';
export type AdminDashboardTrendDirection = 'up' | 'down' | 'flat';
export type AdminDashboardHealthTone = 'healthy' | 'warning' | 'critical' | 'neutral';

export interface AdminDashboardSeriesPoint {
  label: string;
  value: number;
}

export interface AdminDashboardMetric {
  title: string;
  value: number;
  trendValue: number;
  trendDirection: AdminDashboardTrendDirection;
  trendLabel: string;
  key: string;
  series: number[];
}

export interface AdminDashboardHealthEntry {
  key: string;
  label: string;
  value: string;
  tone: AdminDashboardHealthTone;
}

export interface AdminDashboardModerationQueueItem {
  id: string;
  reportedItem: string;
  user: string;
  reason: string;
  severity: string;
  reportsCount: number;
  time: string;
}

export interface AdminDashboardActivityFeedItem {
  id: string;
  type: string;
  description: string;
  timestamp: string;
}

export interface AdminDashboardResponse {
  range: AdminDashboardRange;
  generatedAt: string;
  metrics: AdminDashboardMetric[];
  charts: {
    dailyActiveUsers: AdminDashboardSeriesPoint[];
    weeklySignups: AdminDashboardSeriesPoint[];
    postsPerDay: AdminDashboardSeriesPoint[];
    clubEngagement: AdminDashboardSeriesPoint[];
    trafficPeaks: AdminDashboardSeriesPoint[];
  };
  moderationQueue: AdminDashboardModerationQueueItem[];
  activityFeed: AdminDashboardActivityFeedItem[];
  health: AdminDashboardHealthEntry[];
}

export interface AdminReportListItem {
  id: string;
  reporter: string;
  reporterUserId: string | null;
  targetType: 'user' | 'post' | 'club';
  targetId: string;
  targetUserId: string | null;
  targetLabel: string;
  reason: string;
  evidence: string | null;
  reportFrequency: number;
  severity: 'warning' | 'critical';
  status: 'open' | 'reviewing' | 'resolved' | 'rejected' | 'escalated';
  assignedModerator: string | null;
  assignedAdminUserId: string | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface AdminListPageInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AdminReportListResponse {
  items: AdminReportListItem[];
  pageInfo: AdminListPageInfo;
}

export interface AdminReportActorSummary {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
}

export interface AdminReportTargetPreviewUser {
  kind: 'user';
  id: string;
  label: string;
  email?: string;
  avatarUrl?: string | null;
  status?: string;
  verified?: boolean;
}

export interface AdminReportTargetPreviewClub {
  kind: 'club';
  id: string;
  label: string;
  slug?: string;
  avatarUrl?: string | null;
  status?: string;
  verified?: boolean;
  createdAt?: string;
}

export interface AdminReportTargetPreviewPost {
  kind: 'post';
  id: string;
  label: string;
  preview?: string | null;
  authorUserId?: string;
  authorUsername?: string;
  clubId?: string | null;
  clubName?: string | null;
  status?: string;
  createdAt?: string;
}

export type AdminReportTargetPreview =
  | AdminReportTargetPreviewUser
  | AdminReportTargetPreviewClub
  | AdminReportTargetPreviewPost;

export interface AdminReportNoteEntry {
  id: string;
  author: AdminReportActorSummary;
  note: string;
  createdAt: string;
}

export interface AdminReportAuditEntry {
  id: string;
  actionType: string;
  summary: string;
  severity: string;
  timestamp: string;
  actor: AdminReportActorSummary;
  metadata: Record<string, unknown>;
}

export interface AdminReportDetailResponse {
  id: string;
  reporter: AdminReportActorSummary | null;
  targetType: 'user' | 'post' | 'club';
  targetId: string;
  targetUserId: string | null;
  reason: string;
  evidence: string | null;
  severity: 'warning' | 'critical';
  status: 'open' | 'reviewing' | 'resolved' | 'rejected' | 'escalated';
  reportFrequency: number;
  assignee: AdminReportActorSummary | null;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  targetPreview: AdminReportTargetPreview;
  noteEntries: AdminReportNoteEntry[];
  auditHistory: AdminReportAuditEntry[];
}

export type AdminAnalyticsSegment = 'all' | 'students' | 'alumni';

export interface AdminAnalyticsSummaryMetric {
  key: string;
  label: string;
  value: number;
}

export interface AdminAnalyticsSeriesPoint {
  label: string;
  users?: number;
  posts?: number;
  comments?: number;
  likes?: number;
  value?: number;
}

export interface AdminAnalyticsRetentionCohort {
  cohortLabel: string;
  cohortSize: number;
  week1Rate: number | null;
  week4Rate: number | null;
}

export interface AdminAnalyticsDepartmentRow {
  label: string;
  value: number;
}

export interface AdminAnalyticsClubRow {
  id: string;
  label: string;
  engagement: number;
  posts: number;
  comments: number;
  likes: number;
}

export interface AdminAnalyticsContentRow {
  id: string;
  title: string;
  subtitle: string;
  engagement: number;
  likes: number;
  comments: number;
  createdAt: string;
}

export interface AdminAnalyticsHashtagRow {
  tag: string;
  postCount: number;
  label: 'hot' | 'rising' | 'new' | 'ranked';
}

export interface AdminAnalyticsDeviceRow {
  label: string;
  value: number;
}

export interface AdminAnalyticsResponse {
  range: AdminDashboardRange;
  segment: AdminAnalyticsSegment;
  generatedAt: string;
  summary: AdminAnalyticsSummaryMetric[];
  userGrowth: Array<{ label: string; value: number }>;
  engagement: AdminAnalyticsSeriesPoint[];
  retention: AdminAnalyticsRetentionCohort[];
  activeDepartments: AdminAnalyticsDepartmentRow[];
  topClubs: AdminAnalyticsClubRow[];
  contentPerformance: AdminAnalyticsContentRow[];
  trendingHashtags: AdminAnalyticsHashtagRow[];
  deviceBreakdown: AdminAnalyticsDeviceRow[];
}

export type AdminAnnouncementAudienceType = 'all_users' | 'specific_clubs' | 'specific_branches';
export type AdminAnnouncementStatus = 'draft' | 'scheduled' | 'published';

export interface AdminAnnouncementCreatorSummary {
  id: string;
  username: string;
  email: string;
}

export interface AdminAnnouncementItem {
  id: string;
  title: string;
  content: string;
  audienceType: AdminAnnouncementAudienceType;
  audienceIds: string[];
  status: AdminAnnouncementStatus;
  pinned: boolean;
  pushEnabled: boolean;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  recipientCount: number;
  createdBy: AdminAnnouncementCreatorSummary;
}

export interface AdminAnnouncementDetailResponse extends AdminAnnouncementItem {}

export interface AdminAnnouncementAudienceOption {
  id: string;
  label: string;
}

export interface AdminAnnouncementOptionsResponse {
  clubs: AdminAnnouncementAudienceOption[];
  branches: AdminAnnouncementAudienceOption[];
}

export async function apiAdminLogin(email: string, password: string): Promise<{ token: string; admin: AdminProfile }> {
  return safeFetch('/admin/auth/login', {
    method: 'POST',
    headers: buildHeaders(undefined, true),
    body: JSON.stringify({ email, password }),
  });
}

export async function apiAdminSession(token: string): Promise<{ admin: AdminProfile }> {
  return safeFetch('/admin/auth/session', { headers: buildHeaders(token) });
}

export async function apiAdminGet<T>(path: string, token: string): Promise<T> {
  return safeFetch(path, { headers: buildHeaders(token) });
}

export async function apiAdminPost<T>(path: string, token: string, body?: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<T> {
  return safeFetch(path, {
    method,
    headers: buildHeaders(token, true),
    body: JSON.stringify(body ?? {}),
  });
}

export async function apiAdminDelete<T>(path: string, token: string): Promise<T> {
  return safeFetch(path, {
    method: 'DELETE',
    headers: buildHeaders(token),
  });
}
