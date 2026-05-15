import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Bell,
  BookCheck,
  Building2,
  ChevronRight,
  FileBarChart2,
  FileWarning,
  Flag,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  Settings,
  Users,
  UserCog,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import { Toaster, toast } from 'sonner@2.0.3';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Textarea } from '../components/ui/textarea';
import { apiChangePassword, apiVerifyPasswordChange } from '../lib/authApi';
import {
  apiAdminDelete,
  apiAdminGet,
  apiAdminPost,
  type AdminAnnouncementAudienceOption,
  type AdminAnnouncementAudienceType,
  type AdminAnnouncementDetailResponse,
  type AdminAnnouncementItem,
  type AdminAnnouncementOptionsResponse,
  type AdminAnnouncementStatus,
  type AdminAnalyticsResponse,
  type AdminAnalyticsSegment,
  type AdminLogDetailResponse,
  type AdminLogListItem,
  type AdminLogListResponse,
  type AdminLogSeverity,
  type AdminDashboardRange,
  type AdminDashboardResponse,
  type AdminDashboardTrendDirection,
  type AdminProfile,
  type AdminVerificationRequestItem,
  type AdminReportAuditEntry,
  type AdminReportDetailResponse,
  type AdminReportListItem,
  type AdminReportListResponse,
  type AdminReportTargetPreview,
  type AdminSettingsResponse,
  type AdminSettingsUpdatePayload,
} from './api';
import { clearAdminSession, readAdminSession } from './session';

type PageKey =
  | 'dashboard'
  | 'users'
  | 'clubs'
  | 'posts'
  | 'reports'
  | 'verification'
  | 'analytics'
  | 'announcements'
  | 'logs'
  | 'settings';

const NAV_ITEMS: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'clubs', label: 'Clubs', icon: Building2 },
  { key: 'posts', label: 'Posts', icon: FileWarning },
  { key: 'reports', label: 'Reports', icon: Flag },
  { key: 'verification', label: 'Verification', icon: BookCheck },
  { key: 'analytics', label: 'Analytics', icon: FileBarChart2 },
  { key: 'announcements', label: 'Announcements', icon: Megaphone },
  { key: 'logs', label: 'System Logs', icon: Activity },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const SEARCHABLE_PAGES = new Set<PageKey>(['users', 'clubs', 'posts', 'reports', 'logs']);
const ADMIN_CACHE_MS = 30_000;
const DASHBOARD_RANGES: AdminDashboardRange[] = ['7d', '30d', '90d'];
const ANALYTICS_SEGMENTS: AdminAnalyticsSegment[] = ['all', 'students', 'alumni'];

type DashboardRouteContext = {
  source: string | null;
  metric: string | null;
};

type AdminUserStatus = 'active' | 'suspended' | 'banned';
type AdminUserSortKey = 'lastActive' | 'followers' | 'posts' | 'reports' | 'createdAt';
type AdminSortOrder = 'asc' | 'desc';

type AdminUserListItem = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  college: string;
  department: string | null;
  followers: number;
  postsCount: number;
  reportsCount: number;
  lastActive: string | null;
  createdAt: string;
  suspendedUntil: string | null;
  status: AdminUserStatus;
  verified: boolean;
  avatarUrl: string | null;
};

type AdminUserListResponse = {
  items: AdminUserListItem[];
  pageInfo: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  filterOptions: {
    departments: string[];
  };
};

type AdminUserDetailResponse = {
  id: string;
  username: string;
  fullName: string;
  email: string;
  bio: string | null;
  headline?: string | null;
  college: string;
  department: string | null;
  verified: boolean;
  status: AdminUserStatus;
  avatarUrl: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  suspendedUntil: string | null;
  recentPosts: Array<{ id: string; title: string | null; preview: string | null; createdAt: string; status: string }>;
  clubs: Array<{ id: string; name: string; role: string; status: string }>;
  reports: Array<{ id: string; reason: string; status: string; createdAt: string }>;
  moderationHistory: Array<{
    id: string;
    actionType: string;
    actor: string;
    severity: string;
    summary: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }>;
  loginHistory: Array<{ id: string; browser: string; platform: string; location: string; lastSeenAt: string | null; createdAt: string }>;
};

type UserFilterState = {
  banned: '' | 'true' | 'false';
  verified: '' | 'true' | 'false';
  status: '' | AdminUserStatus;
  department: string;
  sort: AdminUserSortKey;
  order: AdminSortOrder;
  page: number;
  limit: number;
};

type UserActionName = 'warn' | 'suspend' | 'unsuspend' | 'ban' | 'unban' | 'verify';

type AdminClubStatus = 'active' | 'featured' | 'frozen' | 'deleted';
type AdminClubSortKey = 'members' | 'posts' | 'reports' | 'createdAt' | 'lastActivity';

type AdminClubListItem = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  members: number;
  activityScore: number;
  postsCount: number;
  reports: number;
  createdBy: string;
  verified: boolean;
  status: AdminClubStatus;
  createdAt: string;
  lastActivity: string;
};

type AdminClubListResponse = {
  items: AdminClubListItem[];
  pageInfo: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

type AdminClubDetailResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  verified: boolean;
  status: string;
  createdAt: string;
  owner: { id: string; username: string; email: string; avatarUrl: string | null } | null;
  memberSnapshot: { totalMembers: number; adminCount: number };
  analytics: { memberGrowth30d: number; engagement30d: number };
  topPosts: Array<{ id: string; title: string | null; preview: string | null; likes: number; createdAt: string }>;
  linkedReports: Array<{ id: string; reason: string; severity: string; status: string; createdAt: string }>;
  moderationHistory: Array<{
    id: string; actionType: string; actor: string; severity: string;
    summary: string; timestamp: string; metadata?: Record<string, unknown>;
  }>;
};

type AdminClubMember = { id: string; username: string; email: string; role: string; avatarUrl: string | null };

type ClubFilterState = {
  status: '' | AdminClubStatus | 'all';
  verified: '' | 'true' | 'false';
  sort: AdminClubSortKey;
  order: AdminSortOrder;
  page: number;
  limit: number;
};

type ClubActionName = 'verify' | 'feature' | 'unfeature' | 'freeze' | 'unfreeze' | 'delete' | 'restore';

type AdminPostStatus = 'live' | 'hidden' | 'deleted';
type AdminPostSeverity = '' | 'warning' | 'critical';
type AdminPostSortKey = 'createdAt' | 'reports' | 'engagement';

type AdminPostListItem = {
  id: string;
  author: string;
  authorUserId: string;
  club: { id: string | null; name: string; slug: string | null } | null;
  title: string | null;
  preview: string | null;
  mediaUrl: string | null;
  engagement: { likes: number; comments: number; total: number };
  reportsCount: number;
  highestSeverity: AdminPostSeverity;
  hiddenReason: string | null;
  status: AdminPostStatus;
  createdAt: string;
};

type AdminPostListResponse = {
  items: AdminPostListItem[];
  pageInfo: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

type AdminPostDetailResponse = {
  id: string;
  title: string | null;
  content: string | null;
  hiddenReason: string | null;
  status: AdminPostStatus;
  createdAt: string;
  author: { id: string; username: string; email: string; avatarUrl: string | null };
  club: { id: string; name: string; slug: string | null } | null;
  engagement: { likes: number; comments: number; total: number };
  media: Array<{ id: string; url: string; type: string; sortOrder: number }>;
  linkedReports: Array<{ id: string; reason: string; severity: string; status: string; createdAt: string }>;
  moderationHistory: Array<{
    id: string;
    actionType: string;
    actor: string;
    severity: string;
    summary: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }>;
};

type AdminPostComment = {
  id: string;
  postId: string;
  authorUserId: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  parentCommentId: string | null;
  content: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  replies: AdminPostComment[];
};

type AdminPostCommentsResponse = {
  comments: AdminPostComment[];
  nextCursor: string | null;
};

type PostFilterState = {
  status: '' | AdminPostStatus | 'all';
  severity: AdminPostSeverity;
  club: string;
  sort: AdminPostSortKey;
  order: AdminSortOrder;
  page: number;
  limit: number;
};

type PostActionName = 'hide' | 'unhide' | 'delete' | 'restore' | 'warn' | 'suspend_author' | 'escalate';
type AdminReportStatus = 'open' | 'reviewing' | 'resolved' | 'rejected' | 'escalated';
type AdminReportTargetType = 'user' | 'post' | 'club';
type AdminReportAssigneeFilter = 'all' | 'me' | 'unassigned';

type ReportFilterState = {
  status: '' | AdminReportStatus;
  severity: '' | 'warning' | 'critical';
  targetType: '' | AdminReportTargetType;
  assignee: AdminReportAssigneeFilter;
  from: string;
  to: string;
  page: number;
  limit: number;
};

type ReportTimelineItem =
  | {
      id: string;
      type: 'note';
      timestamp: string;
      severity: 'info';
      summary: string;
      actor: { username: string; email: string; avatarUrl: string | null };
      body: string;
      metadata?: Record<string, unknown>;
    }
  | {
      id: string;
      type: 'audit';
      timestamp: string;
      severity: string;
      summary: string;
      actor: { username: string; email: string; avatarUrl: string | null };
      body?: string;
      metadata?: Record<string, unknown>;
    };

type AnnouncementDraftState = {
  title: string;
  content: string;
  audienceType: AdminAnnouncementAudienceType;
  audienceIds: string[];
  scheduledFor: string;
  pinned: boolean;
  pushEnabled: boolean;
};

type AnnouncementFilterState = {
  status: '' | AdminAnnouncementStatus;
  pinned: '' | 'true' | 'false';
  pushEnabled: '' | 'true' | 'false';
};

type LogFilterState = {
  severity: '' | AdminLogSeverity;
  actionType: string;
  targetType: string;
  actor: string;
  from: string;
  to: string;
  page: number;
  limit: number;
};

const DEFAULT_POST_FILTERS: PostFilterState = {
  status: '',
  severity: '',
  club: '',
  sort: 'createdAt',
  order: 'desc',
  page: 1,
  limit: 20,
};

const DEFAULT_REPORT_FILTERS: ReportFilterState = {
  status: '',
  severity: '',
  targetType: '',
  assignee: 'all',
  from: '',
  to: '',
  page: 1,
  limit: 20,
};

const REPORT_STATUS_OPTIONS: Array<{ value: ReportFilterState['status']; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
];

const REPORT_SEVERITY_OPTIONS: Array<{ value: ReportFilterState['severity']; label: string }> = [
  { value: '', label: 'All severities' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const REPORT_TARGET_OPTIONS: Array<{ value: ReportFilterState['targetType']; label: string }> = [
  { value: '', label: 'All targets' },
  { value: 'user', label: 'Users' },
  { value: 'club', label: 'Clubs' },
  { value: 'post', label: 'Posts' },
];

const REPORT_ASSIGNEE_OPTIONS: Array<{ value: ReportFilterState['assignee']; label: string }> = [
  { value: 'all', label: 'All assignees' },
  { value: 'me', label: 'Assigned to me' },
  { value: 'unassigned', label: 'Unassigned' },
];

const DEFAULT_ANNOUNCEMENT_DRAFT: AnnouncementDraftState = {
  title: '',
  content: '',
  audienceType: 'all_users',
  audienceIds: [],
  scheduledFor: '',
  pinned: false,
  pushEnabled: false,
};

const DEFAULT_ANNOUNCEMENT_FILTERS: AnnouncementFilterState = {
  status: '',
  pinned: '',
  pushEnabled: '',
};

const DEFAULT_LOG_FILTERS: LogFilterState = {
  severity: '',
  actionType: '',
  targetType: '',
  actor: '',
  from: '',
  to: '',
  page: 1,
  limit: 20,
};

const SETTINGS_SECTION_LABELS: Record<keyof AdminSettingsResponse, string> = {
  moderation: 'Moderation',
  feedRanking: 'Feed Ranking',
  uploads: 'Uploads',
  notifications: 'Notifications',
  security: 'Security',
  rateLimiting: 'Rate Limiting',
  featureFlags: 'Feature Flags',
};

const POST_STATUS_OPTIONS: Array<{ value: PostFilterState['status']; label: string }> = [
  { value: '', label: 'All visible posts' },
  { value: 'live', label: 'Live' },
  { value: 'hidden', label: 'Hidden' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'all', label: 'All (incl. deleted)' },
];

const POST_SEVERITY_OPTIONS: Array<{ value: AdminPostSeverity; label: string }> = [
  { value: '', label: 'All severities' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

const POST_SORT_OPTIONS: Array<{ value: AdminPostSortKey; label: string }> = [
  { value: 'createdAt', label: 'Created date' },
  { value: 'reports', label: 'Reports' },
  { value: 'engagement', label: 'Engagement' },
];

const DEFAULT_CLUB_FILTERS: ClubFilterState = {
  status: '',
  verified: '',
  sort: 'members',
  order: 'desc',
  page: 1,
  limit: 20,
};

const CLUB_STATUS_OPTIONS: Array<{ value: ClubFilterState['status']; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'featured', label: 'Featured' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'all', label: 'All (incl. deleted)' },
];

const CLUB_SORT_OPTIONS: Array<{ value: AdminClubSortKey; label: string }> = [
  { value: 'members', label: 'Members' },
  { value: 'posts', label: 'Posts' },
  { value: 'reports', label: 'Reports' },
  { value: 'createdAt', label: 'Created date' },
  { value: 'lastActivity', label: 'Last activity' },
];

function getClubActionOptions(club: Pick<AdminClubListItem, 'status' | 'verified'>): Array<{ action: ClubActionName; label: string }> {
  const actions: Array<{ action: ClubActionName; label: string }> = [];
  if (!club.verified) actions.push({ action: 'verify', label: 'Verify' });
  if (club.status === 'deleted') {
    actions.push({ action: 'restore', label: 'Restore' });
  } else {
    if (club.status === 'featured') {
      actions.push({ action: 'unfeature', label: 'Unfeature' });
    } else if (club.status !== 'frozen') {
      actions.push({ action: 'feature', label: 'Feature' });
    }
    if (club.status === 'frozen') {
      actions.push({ action: 'unfreeze', label: 'Unfreeze' });
    } else {
      actions.push({ action: 'freeze', label: 'Freeze' });
    }
    actions.push({ action: 'delete', label: 'Delete' });
  }
  return actions;
}

function buildClubsQueryString(search: string, filters: ClubFilterState) {
  return buildQueryString({
    q: search,
    status: filters.status,
    verified: filters.verified,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    limit: filters.limit,
  });
}

function buildPostsQueryString(search: string, filters: PostFilterState) {
  return buildQueryString({
    q: search,
    status: filters.status,
    severity: filters.severity,
    club: filters.club,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    limit: filters.limit,
  });
}

function buildReportsQueryString(search: string, filters: ReportFilterState) {
  return buildQueryString({
    q: search,
    status: filters.status,
    severity: filters.severity,
    targetType: filters.targetType,
    assignee: filters.assignee,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    limit: filters.limit,
  });
}

function buildAnnouncementsQueryString(filters: AnnouncementFilterState) {
  return buildQueryString({
    status: filters.status,
    pinned: filters.pinned,
    pushEnabled: filters.pushEnabled,
  });
}

function buildLogsQueryString(search: string, filters: LogFilterState) {
  return buildQueryString({
    q: search,
    severity: filters.severity,
    actionType: filters.actionType,
    targetType: filters.targetType,
    actor: filters.actor,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    limit: filters.limit,
  });
}

function getPostActionOptions(post: Pick<AdminPostListItem, 'status'>): Array<{ action: PostActionName; label: string }> {
  if (post.status === 'deleted') {
    return [
      { action: 'restore', label: 'Restore' },
      { action: 'warn', label: 'Warn author' },
      { action: 'suspend_author', label: 'Suspend author' },
    ];
  }
  if (post.status === 'hidden') {
    return [
      { action: 'unhide', label: 'Unhide' },
      { action: 'delete', label: 'Delete' },
      { action: 'warn', label: 'Warn author' },
      { action: 'suspend_author', label: 'Suspend author' },
      { action: 'escalate', label: 'Escalate' },
    ];
  }
  return [
    { action: 'hide', label: 'Hide' },
    { action: 'delete', label: 'Delete' },
    { action: 'warn', label: 'Warn author' },
    { action: 'suspend_author', label: 'Suspend author' },
    { action: 'escalate', label: 'Escalate' },
  ];
}

function getVerificationActionOptions(
  request: Pick<AdminVerificationRequestItem, 'status'>,
): Array<{ status: 'approved' | 'rejected' | 'more_info'; label: string }> {
  if (request.status !== 'pending') {
    return [];
  }
  return [
    { status: 'approved', label: 'Approve' },
    { status: 'rejected', label: 'Reject' },
    { status: 'more_info', label: 'Request more info' },
  ].filter((action) => action.status !== request.status);
}

function getReportActionOptions(
  report: Pick<AdminReportListItem, 'status'> & { assignedModerator?: string | null; assignee?: AdminReportActorSummary | null },
): Array<
  | { type: 'status'; label: string; body: { status: AdminReportStatus; assignToMe?: boolean } }
  | { type: 'assignment'; label: string; body: { clearAssignee: true } }
> {
  const actions: Array<
    | { type: 'status'; label: string; body: { status: AdminReportStatus; assignToMe?: boolean } }
    | { type: 'assignment'; label: string; body: { clearAssignee: true } }
  > = [];

  if (report.status !== 'reviewing') {
    actions.push({ type: 'status', label: 'Review and assign to me', body: { status: 'reviewing', assignToMe: true } });
  }
  if (report.status !== 'resolved') {
    actions.push({ type: 'status', label: 'Resolve', body: { status: 'resolved' } });
  }
  if (report.status !== 'rejected') {
    actions.push({ type: 'status', label: 'Reject', body: { status: 'rejected' } });
  }
  if (report.status !== 'escalated') {
    actions.push({ type: 'status', label: 'Escalate', body: { status: 'escalated' } });
  }
  if (report.assignedModerator || report.assignee) {
    actions.push({ type: 'assignment', label: 'Unassign', body: { clearAssignee: true } });
  }

  return actions;
}


const DEFAULT_USER_FILTERS: UserFilterState = {
  banned: '',
  verified: '',
  status: '',
  department: '',
  sort: 'lastActive',
  order: 'desc',
  page: 1,
  limit: 20,
};

const USER_STATUS_OPTIONS: Array<{ value: UserFilterState['status']; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'banned', label: 'Banned' },
];

const USER_BOOLEAN_OPTIONS: Array<{ value: '' | 'true' | 'false'; label: string }> = [
  { value: '', label: 'All' },
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

const USER_SORT_OPTIONS: Array<{ value: AdminUserSortKey; label: string }> = [
  { value: 'lastActive', label: 'Last active' },
  { value: 'followers', label: 'Followers' },
  { value: 'posts', label: 'Posts' },
  { value: 'reports', label: 'Reports' },
  { value: 'createdAt', label: 'Created date' },
];

function getSearchKey(page: PageKey, search: string): string {
  return SEARCHABLE_PAGES.has(page) ? search.trim() : '';
}

function parseDashboardRange(value: string | null | undefined): AdminDashboardRange {
  return DASHBOARD_RANGES.includes(value as AdminDashboardRange) ? (value as AdminDashboardRange) : '7d';
}

function parseDashboardContext(search: string): DashboardRouteContext {
  const params = new URLSearchParams(search);
  return {
    source: params.get('source'),
    metric: params.get('metric'),
  };
}

function buildQueryString(params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    searchParams.set(key, String(value));
  }
  return searchParams.toString();
}

function buildUsersQueryString(search: string, filters: UserFilterState) {
  return buildQueryString({
    q: search,
    banned: filters.banned,
    verified: filters.verified,
    status: filters.status,
    department: filters.department,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    limit: filters.limit,
  });
}

function getAdminQueryKey(token: string, page: PageKey, search = '', range: AdminDashboardRange = '7d', context = '') {
  return ['admin', token, page, search, range, context] as const;
}

function getAdminUserDetailQueryKey(token: string, userId: string) {
  return ['admin', token, 'user-detail', userId] as const;
}

async function fetchAdminPageData(
  page: PageKey,
  token: string,
  search: string,
  range: AdminDashboardRange,
  userFilters: UserFilterState,
  clubFilters: ClubFilterState = DEFAULT_CLUB_FILTERS,
  postFilters: PostFilterState = DEFAULT_POST_FILTERS,
  reportFilters: ReportFilterState = DEFAULT_REPORT_FILTERS,
  analyticsSegment: AdminAnalyticsSegment = 'all',
  announcementFilters: AnnouncementFilterState = DEFAULT_ANNOUNCEMENT_FILTERS,
  logFilters: LogFilterState = DEFAULT_LOG_FILTERS,
) {
  if (page === 'dashboard') return apiAdminGet<AdminDashboardResponse>(`/admin/dashboard?range=${encodeURIComponent(range)}`, token);
  if (page === 'users') return apiAdminGet<AdminUserListResponse>(`/admin/users?${buildUsersQueryString(search, userFilters)}`, token);
  if (page === 'clubs') return apiAdminGet<AdminClubListResponse>(`/admin/clubs?${buildClubsQueryString(search, clubFilters)}`, token);
  if (page === 'posts') return apiAdminGet<AdminPostListResponse>(`/admin/posts?${buildPostsQueryString(search, postFilters)}`, token);
  if (page === 'reports') return apiAdminGet<AdminReportListResponse>(`/admin/reports?${buildReportsQueryString(search, reportFilters)}`, token);
  if (page === 'verification') return apiAdminGet('/admin/verification-requests', token);
  if (page === 'analytics') return apiAdminGet<AdminAnalyticsResponse>(`/admin/analytics?range=${encodeURIComponent(range)}&segment=${encodeURIComponent(analyticsSegment)}`, token);
  if (page === 'announcements') return apiAdminGet<AdminAnnouncementItem[]>(`/admin/announcements?${buildAnnouncementsQueryString(announcementFilters)}`, token);
  if (page === 'logs') return apiAdminGet<AdminLogListResponse>(`/admin/logs?${buildLogsQueryString(search, logFilters)}`, token);
  return apiAdminGet<AdminSettingsResponse>('/admin/settings', token);
}

function parsePageFromPath(pathname: string): PageKey {
  const [, admin, section] = pathname.split('/');
  if (admin !== 'admin') return 'dashboard';
  const keys = new Set<PageKey>(NAV_ITEMS.map((item) => item.key));
  return keys.has(section as PageKey) ? (section as PageKey) : 'dashboard';
}

function formatNumber(value: number | string | null | undefined): string {
  if (value == null) return '0';
  return new Intl.NumberFormat('en-US').format(Number(value));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return 'â€”';
  return new Date(value).toLocaleDateString();
}

function humanizeSettingKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/^./, (character) => character.toUpperCase());
}

function getReportTargetKindLabel(targetType: AdminReportTargetType): string {
  if (targetType === 'user') return 'User';
  if (targetType === 'club') return 'Club';
  return 'Post';
}

function buildReportTimeline(detail: AdminReportDetailResponse | null): ReportTimelineItem[] {
  if (!detail) return [];
  const noteItems: ReportTimelineItem[] = detail.noteEntries.map((entry) => ({
    id: `note-${entry.id}`,
    type: 'note',
    timestamp: entry.createdAt,
    severity: 'info',
    summary: 'Internal note added',
    actor: entry.author,
    body: entry.note,
  }));
  const auditItems: ReportTimelineItem[] = detail.auditHistory.map((entry: AdminReportAuditEntry) => ({
    id: `audit-${entry.id}`,
    type: 'audit',
    timestamp: entry.timestamp,
    severity: entry.severity,
    summary: entry.summary,
    actor: entry.actor,
    body: typeof entry.metadata?.note === 'string' ? String(entry.metadata.note) : undefined,
    metadata: entry.metadata,
  }));

  return [...noteItems, ...auditItems].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function statusTone(status: string | boolean | null | undefined): string {
  const value = String(status ?? '').toLowerCase();
  if (value.includes('critical') || value.includes('danger') || value.includes('ban') || value.includes('reject') || value.includes('delete')) {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (value.includes('warning') || value.includes('review') || value.includes('open') || value.includes('pending') || value.includes('suspend')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (value.includes('healthy') || value.includes('approved') || value.includes('verified') || value.includes('active') || value.includes('resolved') || value.includes('published')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function StatusBadge({ value }: { value: string | boolean | null | undefined }) {
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${statusTone(value)}`}>{String(value ?? 'inactive')}</span>;
}

function formatRangeLabel(range: AdminDashboardRange): string {
  if (range === '7d') return 'Last 7 days';
  if (range === '30d') return 'Last 30 days';
  return 'Last 90 days';
}

function trendTone(direction: AdminDashboardTrendDirection): string {
  if (direction === 'up') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (direction === 'down') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function TrendBadge({ label, direction }: { label: string; direction: AdminDashboardTrendDirection }) {
  return <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${trendTone(direction)}`}>{label}</span>;
}

function getUserActionOptions(user: Pick<AdminUserListItem, 'status' | 'verified'>): Array<{ action: UserActionName; label: string }> {
  const actions: Array<{ action: UserActionName; label: string }> = [{ action: 'warn', label: 'Warn' }];
  if (user.status === 'banned') {
    actions.push({ action: 'unban', label: 'Unban' });
  } else if (user.status === 'suspended') {
    actions.push({ action: 'unsuspend', label: 'Unsuspend' }, { action: 'ban', label: 'Ban' });
  } else {
    actions.push({ action: 'suspend', label: 'Suspend' }, { action: 'ban', label: 'Ban' });
  }
  if (!user.verified) {
    actions.push({ action: 'verify', label: 'Verify' });
  }
  return actions;
}

function ShellCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function MiniSparkline({ values }: { values: number[] }) {
  if (!values.length) return <div className="h-8 rounded bg-slate-100" />;
  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={values.map((value, index) => ({ index, value }))}>
          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RightDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const handleDrawerWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const handleBackdropWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  if (!open) return null;
  return (
    <div
      className="z-50 bg-slate-900/20"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        overscrollBehavior: 'contain',
      }}
      onWheel={handleBackdropWheel}
    >
      <div
        className="border-l border-slate-200 bg-white shadow-xl"
        onWheel={handleDrawerWheel}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          width: 'min(520px, 95vw)',
          height: '100dvh',
          maxHeight: '100dvh',
          flexDirection: 'column',
          overflow: 'hidden',
          overscrollBehavior: 'contain',
        }}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4 sm:px-5 sm:py-5" style={{ flex: '0 0 auto' }}>
          <div className="min-w-0 pr-4">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div
          className="px-4 py-4 sm:px-5 sm:py-5"
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-2 text-sm text-slate-500">{body}</p>
    </div>
  );
}

// SessionLoadingScreen removed — dashboard renders immediately when a token exists.

export default function AdminRoot() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<PageKey>(() => parsePageFromPath(window.location.pathname));
  const [dashboardRange, setDashboardRange] = useState<AdminDashboardRange>(() => parseDashboardRange(new URLSearchParams(window.location.search).get('range')));
  const [dashboardContext, setDashboardContext] = useState<DashboardRouteContext>(() => parseDashboardContext(window.location.search));
  const [analyticsSegment, setAnalyticsSegment] = useState<AdminAnalyticsSegment>('all');
  const [collapsed, setCollapsed] = useState(false);
  const [token, setToken] = useState<string | null>(() => readAdminSession()?.token ?? null);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(readAdminSession()?.token));
  const [search, setSearch] = useState('');
  const [userFilters, setUserFilters] = useState<UserFilterState>(DEFAULT_USER_FILTERS);
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null);
  const [selectedClub, setSelectedClub] = useState<AdminClubListItem | null>(null);
  const [selectedClubDetail, setSelectedClubDetail] = useState<AdminClubDetailResponse | null>(null);
  const [clubFilters, setClubFilters] = useState<ClubFilterState>(DEFAULT_CLUB_FILTERS);
  const [clubMembers, setClubMembers] = useState<AdminClubMember[]>([]);
  const [selectedPost, setSelectedPost] = useState<AdminPostListItem | null>(null);
  const [selectedPostDetail, setSelectedPostDetail] = useState<AdminPostDetailResponse | null>(null);
  const [selectedPostComments, setSelectedPostComments] = useState<AdminPostComment[]>([]);
  const [selectedPostCommentsNextCursor, setSelectedPostCommentsNextCursor] = useState<string | null>(null);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Record<string, boolean>>({});
  const [commentRepliesByParentId, setCommentRepliesByParentId] = useState<Record<string, AdminPostComment[]>>({});
  const [commentRepliesNextCursorByParentId, setCommentRepliesNextCursorByParentId] = useState<Record<string, string | null>>({});
  const [commentRepliesLoadingByParentId, setCommentRepliesLoadingByParentId] = useState<Record<string, boolean>>({});
  const [postFilters, setPostFilters] = useState<PostFilterState>(DEFAULT_POST_FILTERS);
  const [reportFilters, setReportFilters] = useState<ReportFilterState>(DEFAULT_REPORT_FILTERS);
  const [selectedReport, setSelectedReport] = useState<AdminReportListItem | null>(null);
  const [selectedReportDetail, setSelectedReportDetail] = useState<AdminReportDetailResponse | null>(null);
  const [reportInternalNotes, setReportInternalNotes] = useState('');
  const [reportNoteDraft, setReportNoteDraft] = useState('');
  const [postActionNote, setPostActionNote] = useState('');
  const [commentActionNote, setCommentActionNote] = useState('');
  const [transferTarget, setTransferTarget] = useState<string>('');
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userActionForm, setUserActionForm] = useState({ note: '', durationDays: 7 });

  const [announcementDraft, setAnnouncementDraft] = useState<AnnouncementDraftState>(DEFAULT_ANNOUNCEMENT_DRAFT);
  const [announcementFilters, setAnnouncementFilters] = useState<AnnouncementFilterState>(DEFAULT_ANNOUNCEMENT_FILTERS);
  const [announcementOptions, setAnnouncementOptions] = useState<AdminAnnouncementOptionsResponse>({ clubs: [], branches: [] });
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AdminAnnouncementItem | null>(null);
  const [selectedAnnouncementDetail, setSelectedAnnouncementDetail] = useState<AdminAnnouncementDetailResponse | null>(null);
  const [announcementRecipientCount, setAnnouncementRecipientCount] = useState<number | null>(null);
  const [logFilters, setLogFilters] = useState<LogFilterState>(DEFAULT_LOG_FILTERS);
  const [selectedLog, setSelectedLog] = useState<AdminLogListItem | null>(null);
  const [selectedLogDetail, setSelectedLogDetail] = useState<AdminLogDetailResponse | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<AdminSettingsResponse | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const [verificationDecisionNote, setVerificationDecisionNote] = useState('');
  const [hasOpenedVerificationRequest, setHasOpenedVerificationRequest] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordState, setPasswordState] = useState({ isSaving: false, message: '', error: '' });

  const pageTitle = useMemo(() => NAV_ITEMS.find((item) => item.key === page)?.label ?? 'Dashboard', [page]);
  const searchKey = useMemo(() => getSearchKey(page, search), [page, search]);
  const usersQueryContext = useMemo(() => (page === 'users' ? JSON.stringify(userFilters) : ''), [page, userFilters]);
  const clubsQueryContext = useMemo(() => (page === 'clubs' ? JSON.stringify(clubFilters) : ''), [page, clubFilters]);
  const postsQueryContext = useMemo(() => (page === 'posts' ? JSON.stringify(postFilters) : ''), [page, postFilters]);
  const reportsQueryContext = useMemo(() => (page === 'reports' ? JSON.stringify(reportFilters) : ''), [page, reportFilters]);
  const analyticsQueryContext = useMemo(() => (page === 'analytics' ? analyticsSegment : ''), [page, analyticsSegment]);
  const announcementsQueryContext = useMemo(() => (page === 'announcements' ? JSON.stringify(announcementFilters) : ''), [page, announcementFilters]);
  const logsQueryContext = useMemo(() => (page === 'logs' ? JSON.stringify(logFilters) : ''), [page, logFilters]);

  useEffect(() => {
    const handlePopState = () => {
      setPage(parsePageFromPath(window.location.pathname));
      setDashboardRange(parseDashboardRange(new URLSearchParams(window.location.search).get('range')));
      setDashboardContext(parseDashboardContext(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!token && !authLoading) {
      window.location.replace('/');
    }
  }, [token, authLoading]);

  useEffect(() => {
    if (page !== 'users') return;
    setUserFilters((current) => (current.page === 1 ? current : { ...current, page: 1 }));
  }, [page, searchKey]);

  useEffect(() => {
    if (page !== 'clubs') return;
    setClubFilters((current) => (current.page === 1 ? current : { ...current, page: 1 }));
  }, [page, searchKey]);

  useEffect(() => {
    if (page !== 'posts') return;
    setPostFilters((current) => (current.page === 1 ? current : { ...current, page: 1 }));
  }, [page, searchKey]);

  useEffect(() => {
    if (page !== 'reports') return;
    setReportFilters((current) => (current.page === 1 ? current : { ...current, page: 1 }));
  }, [page, searchKey]);

  useEffect(() => {
    if (page !== 'logs') return;
    setLogFilters((current) => (current.page === 1 ? current : { ...current, page: 1 }));
  }, [page, searchKey]);

  useEffect(() => {
    if (page !== 'users') return;
    setSelectedUserIds([]);
  }, [page, searchKey, userFilters]);

  useEffect(() => {
    if (!token || page !== 'announcements') return;
    let cancelled = false;
    apiAdminGet<AdminAnnouncementOptionsResponse>('/admin/announcements/options', token)
      .then((result) => {
        if (!cancelled) setAnnouncementOptions(result);
      })
      .catch(() => {
        if (!cancelled) setAnnouncementOptions({ clubs: [], branches: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [token, page]);

  useEffect(() => {
    if (!token || page !== 'announcements') return;
    let cancelled = false;
    apiAdminPost<{ recipientCount: number }>('/admin/announcements/preview', token, {
      audienceType: announcementDraft.audienceType,
      audienceIds: announcementDraft.audienceIds,
    }).then((result) => {
      if (!cancelled) setAnnouncementRecipientCount(result.recipientCount);
    }).catch(() => {
      if (!cancelled) setAnnouncementRecipientCount(null);
    });
    return () => {
      cancelled = true;
    };
  }, [token, page, announcementDraft.audienceType, announcementDraft.audienceIds]);

  useEffect(() => {
    if (!token) {
      setAuthLoading(false);
      setAdmin(null);
      return;
    }

    let cancelled = false;
    setAuthLoading(true);
    apiAdminGet<{ admin: AdminProfile }>('/admin/auth/session', token)
      .then((result) => {
        if (cancelled) return;
        setAdmin(result.admin);
      })
      .catch(() => {
        if (cancelled) return;
        clearAdminSession();
        setToken(null);
        setAdmin(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const canQueryAdmin = Boolean(token && admin);

  const dashboardQuery = useQuery({
    queryKey: token ? getAdminQueryKey(token, 'dashboard', '', dashboardRange) : ['admin', 'dashboard', 'anon', dashboardRange, ''],
    queryFn: () => fetchAdminPageData('dashboard', token!, '', dashboardRange, userFilters),
    enabled: canQueryAdmin,
    staleTime: ADMIN_CACHE_MS,
    gcTime: ADMIN_CACHE_MS * 10,
    refetchInterval: ADMIN_CACHE_MS,
  });

  const currentPageQuery = useQuery({
    queryKey: token ? getAdminQueryKey(token, page, searchKey, dashboardRange, usersQueryContext + clubsQueryContext + postsQueryContext + reportsQueryContext + analyticsQueryContext + announcementsQueryContext + logsQueryContext) : ['admin', page, searchKey, 'anon', dashboardRange, usersQueryContext + clubsQueryContext + postsQueryContext + reportsQueryContext + analyticsQueryContext + announcementsQueryContext + logsQueryContext],
    queryFn: () => fetchAdminPageData(page, token!, searchKey, dashboardRange, userFilters, clubFilters, postFilters, reportFilters, analyticsSegment, announcementFilters, logFilters),
    enabled: canQueryAdmin && page !== 'dashboard',
    staleTime: ADMIN_CACHE_MS,
    gcTime: ADMIN_CACHE_MS * 10,
    refetchInterval: page === 'reports' || page === 'logs' ? ADMIN_CACHE_MS : false,
  });

  const dashboard = (dashboardQuery.data as AdminDashboardResponse | null) ?? null;
  const usersResponse = page === 'users' ? ((currentPageQuery.data as AdminUserListResponse | null) ?? null) : null;
  const users = usersResponse?.items ?? [];
  const usersPageInfo = usersResponse?.pageInfo ?? null;
  const userFilterOptions = usersResponse?.filterOptions ?? { departments: [] };
  const clubsResponse = page === 'clubs' ? ((currentPageQuery.data as AdminClubListResponse | null) ?? null) : null;
  const clubs = clubsResponse?.items ?? [];
  const clubsPageInfo = clubsResponse?.pageInfo ?? null;
  const postsResponse = page === 'posts' ? ((currentPageQuery.data as AdminPostListResponse | null) ?? null) : null;
  const posts = postsResponse?.items ?? [];
  const postsPageInfo = postsResponse?.pageInfo ?? null;
  const reportsResponse = page === 'reports' ? ((currentPageQuery.data as AdminReportListResponse | null) ?? null) : null;
  const reports = reportsResponse?.items ?? [];
  const reportsPageInfo = reportsResponse?.pageInfo ?? null;
  const verification = page === 'verification' ? ((currentPageQuery.data as AdminVerificationRequestItem[]) ?? []) : [];
  const selectedVerification = useMemo(
    () => verification.find((item) => item.id === selectedVerificationId) ?? null,
    [verification, selectedVerificationId],
  );
  const analytics = page === 'analytics' ? ((currentPageQuery.data as AdminAnalyticsResponse | null) ?? null) : null;
  const announcements = page === 'announcements' ? ((currentPageQuery.data as AdminAnnouncementItem[]) ?? []) : [];
  const logsResponse = page === 'logs' ? ((currentPageQuery.data as AdminLogListResponse | null) ?? null) : null;
  const logs = logsResponse?.items ?? [];
  const logsPageInfo = logsResponse?.pageInfo ?? null;
  const settings = page === 'settings' ? ((currentPageQuery.data as AdminSettingsResponse | null) ?? null) : null;
  const activeQuery = page === 'dashboard' ? dashboardQuery : currentPageQuery;
  const pageLoading = activeQuery.isLoading;
  const pageRefreshing = activeQuery.isFetching && !activeQuery.isLoading;
  const reportTimeline = useMemo(() => buildReportTimeline(selectedReportDetail), [selectedReportDetail]);
  useEffect(() => {
    if (page !== 'settings') return;
    setSettingsDraft(settings ? JSON.parse(JSON.stringify(settings)) as AdminSettingsResponse : null);
  }, [page, settings]);

  useEffect(() => {
    if (page !== 'verification') return;
    setSelectedVerificationId((current) => {
      if (current && verification.some((item) => item.id === current)) return current;
      return null;
    });
  }, [page, verification]);

  useEffect(() => {
    if (page !== 'verification') return;
    setSelectedVerificationId(null);
    setHasOpenedVerificationRequest(false);
  }, [page]);

  useEffect(() => {
    setVerificationDecisionNote(selectedVerification?.decisionNote ?? '');
  }, [selectedVerification?.id, selectedVerification?.decisionNote]);

  const selectedUserDetailQuery = useQuery({
    queryKey: selectedUser && token ? getAdminUserDetailQueryKey(token, selectedUser.id) : ['admin', 'user-detail', 'idle'],
    queryFn: () => apiAdminGet<AdminUserDetailResponse>(`/admin/users/${selectedUser!.id}`, token!),
    enabled: Boolean(token && selectedUser),
    staleTime: ADMIN_CACHE_MS,
    gcTime: ADMIN_CACHE_MS * 10,
  });
  const selectedUserDetail = selectedUserDetailQuery.data ?? null;
  const userDetailLoading = selectedUserDetailQuery.isLoading || (selectedUserDetailQuery.isFetching && !selectedUserDetail);
  const clubDetailLoading = Boolean(selectedClub && !selectedClubDetail);
  const postDetailLoading = Boolean(selectedPost && !selectedPostDetail);
  const reportDetailLoading = Boolean(selectedReport && !selectedReportDetail);
  const logDetailLoading = Boolean(selectedLog && !selectedLogDetail);

  const goTo = (nextPage: PageKey, params?: Record<string, string | null | undefined>) => {
    const url = new URL(window.location.href);
    url.pathname = nextPage === 'dashboard' ? '/admin' : `/admin/${nextPage}`;
    url.search = '';
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value) {
          url.searchParams.set(key, value);
        }
      }
    }
    window.history.pushState({ page: nextPage }, '', `${url.pathname}${url.search}`);
    setPage(nextPage);
    setDashboardRange(parseDashboardRange(url.searchParams.get('range')));
    setDashboardContext(parseDashboardContext(url.search));
  };

  const prefetchPage = (nextPage: PageKey) => {
    if (!token || !admin) return;
    const nextSearchKey = getSearchKey(nextPage, search);
    const nextContext = nextPage === 'users'
      ? JSON.stringify(userFilters)
      : nextPage === 'clubs'
        ? JSON.stringify(clubFilters)
        : nextPage === 'posts'
          ? JSON.stringify(postFilters)
          : nextPage === 'reports'
            ? JSON.stringify(reportFilters)
            : nextPage === 'analytics'
              ? analyticsSegment
              : nextPage === 'announcements'
                ? JSON.stringify(announcementFilters)
          : '';
    void queryClient.prefetchQuery({
      queryKey: getAdminQueryKey(token, nextPage, nextSearchKey, dashboardRange, nextContext),
      queryFn: () => fetchAdminPageData(nextPage, token, nextSearchKey, dashboardRange, userFilters, clubFilters, postFilters, reportFilters, analyticsSegment, announcementFilters, logFilters),
      staleTime: ADMIN_CACHE_MS,
    });
  };

  const prefetchUserDetail = (userId: string) => {
    if (!token || !admin) return;
    void queryClient.prefetchQuery({
      queryKey: getAdminUserDetailQueryKey(token, userId),
      queryFn: () => apiAdminGet<AdminUserDetailResponse>(`/admin/users/${userId}`, token),
      staleTime: ADMIN_CACHE_MS,
    });
  };

  const handleLogout = () => {
    clearAdminSession();
    queryClient.removeQueries({ queryKey: ['admin'] });
    window.location.replace('/');
  };

  const refreshCurrentPage = async () => {
    if (!token) return;
    await queryClient.invalidateQueries({ queryKey: getAdminQueryKey(token, page, searchKey, dashboardRange, usersQueryContext + clubsQueryContext + postsQueryContext + reportsQueryContext + analyticsQueryContext + announcementsQueryContext + logsQueryContext), exact: true });
    if (page !== 'dashboard') {
      await queryClient.invalidateQueries({ queryKey: getAdminQueryKey(token, 'dashboard', '', dashboardRange), exact: true });
    }
  };

  const runVerificationAction = async (status: 'approved' | 'rejected' | 'more_info') => {
    if (!token || !selectedVerification) return;
    try {
      await apiAdminPost(
        `/admin/verification-requests/${selectedVerification.id}`,
        token,
        {
          status,
          decisionNote: verificationDecisionNote.trim() || null,
        },
        'PATCH',
      );
      toast.success(`Verification request marked ${status.replace('_', ' ')}`);
      await refreshCurrentPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update verification request');
    }
  };

  const runUserAction = async (userId: string, action: UserActionName, options?: { note?: string; durationDays?: number }) => {
    if (!token) return;
    try {
      await apiAdminPost(`/admin/users/${userId}/actions`, token, { action, note: options?.note, durationDays: options?.durationDays });
      toast.success(`User ${action} completed`);
      setUserActionForm((current) => ({ ...current, note: '' }));
      await refreshCurrentPage();
      if (selectedUser?.id === userId) {
        await queryClient.invalidateQueries({ queryKey: getAdminUserDetailQueryKey(token, userId), exact: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} user`);
    }
  };

  const runClubAction = async (clubId: string, action: string, body?: Record<string, unknown>) => {
    if (!token) return;
    try {
      await apiAdminPost(`/admin/clubs/${clubId}/actions`, token, { action, ...body });
      toast.success(`Club ${action} completed`);
      await refreshCurrentPage();
      if (selectedClub?.id === clubId) {
        setSelectedClubDetail(await apiAdminGet<AdminClubDetailResponse>(`/admin/clubs/${clubId}`, token));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} club`);
    }
  };

  const runPostAction = async (postId: string, action: PostActionName, options?: { note?: string }) => {
    if (!token) return;
    try {
      const response = await apiAdminPost<{ success: true; reportId?: string | null }>(`/admin/posts/${postId}/actions`, token, {
        action,
        note: options?.note,
      });
      toast.success(`Post ${action} completed`);
      setPostActionNote('');
      await refreshCurrentPage();
      if (selectedPost?.id === postId) {
        setSelectedPostDetail(await apiAdminGet<AdminPostDetailResponse>(`/admin/posts/${postId}`, token));
      }
      if (action === 'escalate' && response?.reportId) {
        goTo('reports');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} post`);
    }
  };

  const runCommentAction = async (commentId: string, action: 'delete' | 'warn_author' | 'suspend_author', postId: string, options?: { note?: string }) => {
    if (!token) return;
    try {
      await apiAdminPost(`/admin/comments/${commentId}/actions`, token, {
        action,
        note: options?.note,
      });
      toast.success(`Comment ${action} completed`);
      if (selectedPost?.id === postId) {
        const [detail, commentsResponse] = await Promise.all([
          apiAdminGet<AdminPostDetailResponse>(`/admin/posts/${postId}`, token),
          apiAdminGet<AdminPostCommentsResponse>(`/admin/posts/${postId}/comments?limit=20`, token),
        ]);
        setSelectedPostDetail(detail);
        setSelectedPostComments(commentsResponse.comments ?? []);
        setSelectedPostCommentsNextCursor(commentsResponse.nextCursor ?? null);
        setExpandedCommentIds({});
        setCommentRepliesByParentId({});
        setCommentRepliesNextCursorByParentId({});
        setCommentRepliesLoadingByParentId({});
      }
      setCommentActionNote('');
      await refreshCurrentPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Unable to ${action} comment`);
    }
  };

  const openUserDrawer = (user: AdminUserListItem) => {
    setSelectedUser(user);
    setUserActionForm({ note: '', durationDays: 7 });
  };

  const openClubDrawer = async (club: AdminClubListItem) => {
    if (!token) return;
    setSelectedClub(club);
    setTransferTarget('');
    setTransferConfirm(false);
    setClubMembers([]);
    setSelectedClubDetail(await apiAdminGet<AdminClubDetailResponse>(`/admin/clubs/${club.id}`, token));
  };

  const openPostDrawer = async (post: AdminPostListItem) => {
    if (!token) return;
    setSelectedPost(post);
    setPostActionNote(post.hiddenReason ?? '');
    setCommentActionNote('');
    setExpandedCommentIds({});
    setCommentRepliesByParentId({});
    setCommentRepliesNextCursorByParentId({});
    setCommentRepliesLoadingByParentId({});
    const [detail, commentsResponse] = await Promise.all([
      apiAdminGet<AdminPostDetailResponse>(`/admin/posts/${post.id}`, token),
      apiAdminGet<AdminPostCommentsResponse>(`/admin/posts/${post.id}/comments?limit=20`, token),
    ]);
    setSelectedPostDetail(detail);
    setSelectedPostComments(commentsResponse.comments ?? []);
    setSelectedPostCommentsNextCursor(commentsResponse.nextCursor ?? null);
  };

  const openReportDrawer = async (report: AdminReportListItem) => {
    if (!token) return;
    setSelectedReport(report);
    setSelectedReportDetail(null);
    setReportNoteDraft('');
    const detail = await apiAdminGet<AdminReportDetailResponse>(`/admin/reports/${report.id}`, token);
    setSelectedReportDetail(detail);
    setReportInternalNotes(detail.internalNotes ?? '');
  };

  const refreshSelectedReportDetail = async (reportId: string) => {
    if (!token) return;
    const detail = await apiAdminGet<AdminReportDetailResponse>(`/admin/reports/${reportId}`, token);
    setSelectedReportDetail(detail);
    setReportInternalNotes(detail.internalNotes ?? '');
  };

  const runReportAction = async (
    reportId: string,
    body: { status?: AdminReportStatus; assignToMe?: boolean; clearAssignee?: boolean; internalNotes?: string },
    successMessage: string,
  ) => {
    if (!token) return;
    try {
      await apiAdminPost(`/admin/reports/${reportId}`, token, body, 'PATCH');
      toast.success(successMessage);
      await refreshCurrentPage();
      if (selectedReport?.id === reportId) {
        await refreshSelectedReportDetail(reportId);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update report');
    }
  };

  const saveReportInternalNotes = async () => {
    if (!selectedReport) return;
    await runReportAction(selectedReport.id, { internalNotes: reportInternalNotes }, 'Internal notes saved');
  };

  const addReportNote = async () => {
    if (!token || !selectedReport) return;
    const trimmed = reportNoteDraft.trim();
    if (!trimmed) {
      toast.error('Add a note before submitting.');
      return;
    }
    try {
      await apiAdminPost(`/admin/reports/${selectedReport.id}/notes`, token, { note: trimmed });
      setReportNoteDraft('');
      toast.success('Report note added');
      await refreshCurrentPage();
      await refreshSelectedReportDetail(selectedReport.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to add report note');
    }
  };

  const resetAnnouncementDraft = () => {
    setAnnouncementDraft(DEFAULT_ANNOUNCEMENT_DRAFT);
  };

  const openAnnouncementDrawer = async (announcement: AdminAnnouncementItem) => {
    if (!token) return;
    setSelectedAnnouncement(announcement);
    const detail = await apiAdminGet<AdminAnnouncementDetailResponse>(`/admin/announcements/${announcement.id}`, token);
    setSelectedAnnouncementDetail(detail);
    setAnnouncementDraft({
      title: detail.title,
      content: detail.content,
      audienceType: detail.audienceType,
      audienceIds: detail.audienceIds,
      scheduledFor: detail.scheduledFor ? detail.scheduledFor.slice(0, 16) : '',
      pinned: detail.pinned,
      pushEnabled: detail.pushEnabled,
    });
  };

  const refreshSelectedAnnouncement = async (announcementId: string) => {
    if (!token) return;
    const detail = await apiAdminGet<AdminAnnouncementDetailResponse>(`/admin/announcements/${announcementId}`, token);
    setSelectedAnnouncementDetail(detail);
    setSelectedAnnouncement((current) => (current?.id === announcementId ? detail : current));
  };

  const saveAnnouncement = async () => {
    if (!token) return;
    if (!announcementDraft.title.trim() || !announcementDraft.content.trim()) {
      toast.error('Title and content are required.');
      return;
    }
    try {
      const payload = {
        title: announcementDraft.title,
        content: announcementDraft.content,
        audienceType: announcementDraft.audienceType,
        audienceIds: announcementDraft.audienceIds,
        scheduledFor: announcementDraft.scheduledFor || null,
        pinned: announcementDraft.pinned,
        pushEnabled: announcementDraft.pushEnabled,
      };
      if (selectedAnnouncement) {
        await apiAdminPost(`/admin/announcements/${selectedAnnouncement.id}`, token, payload, 'PATCH');
        toast.success('Announcement updated');
        await refreshCurrentPage();
        await refreshSelectedAnnouncement(selectedAnnouncement.id);
      } else {
        await apiAdminPost('/admin/announcements', token, payload);
        toast.success(payload.scheduledFor ? 'Announcement scheduled' : 'Announcement published');
        resetAnnouncementDraft();
        await refreshCurrentPage();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save announcement');
    }
  };

  const runAnnouncementAction = async (announcementId: string, action: 'publish_now' | 'unpublish' | 'cancel_schedule' | 'delete') => {
    if (!token) return;
    try {
      if (action === 'delete') {
        await apiAdminDelete(`/admin/announcements/${announcementId}`, token);
        toast.success('Announcement deleted');
        if (selectedAnnouncement?.id === announcementId) {
          setSelectedAnnouncement(null);
          setSelectedAnnouncementDetail(null);
          resetAnnouncementDraft();
        }
      } else {
        await apiAdminPost(`/admin/announcements/${announcementId}`, token, { action }, 'PATCH');
        toast.success(`Announcement ${action.replace('_', ' ')}`);
        if (selectedAnnouncement?.id === announcementId) {
          await refreshSelectedAnnouncement(announcementId);
        }
      }
      await refreshCurrentPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update announcement');
    }
  };

  const toggleAnnouncementAudienceId = (id: string) => {
    setAnnouncementDraft((current) => ({
      ...current,
      audienceIds: current.audienceIds.includes(id)
        ? current.audienceIds.filter((item) => item !== id)
        : [...current.audienceIds, id],
    }));
  };

  const announcementRecipientPreview = selectedAnnouncementDetail?.recipientCount ?? announcements.find((item) => item.id === selectedAnnouncement?.id)?.recipientCount ?? 0;

  const openLogDrawer = async (log: AdminLogListItem) => {
    if (!token) return;
    setSelectedLog(log);
    try {
      const detail = await apiAdminGet<AdminLogDetailResponse>(`/admin/logs/${log.id}`, token);
      setSelectedLogDetail(detail);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load log detail');
    }
  };

  const exportLogsCsv = async () => {
    if (!token) return;
    if ((logsPageInfo?.total ?? 0) === 0) {
      toast.error('No logs match the current filters.');
      return;
    }
    try {
      const exportResponse = await apiAdminGet<AdminLogListResponse>(`/admin/logs?${buildLogsQueryString(searchKey, { ...logFilters, page: 1, limit: Math.max(logsPageInfo?.total ?? logFilters.limit, logFilters.limit) })}`, token);
      const detailRows = await Promise.all(exportResponse.items.map((item) => apiAdminGet<AdminLogDetailResponse>(`/admin/logs/${item.id}`, token)));
      const escapeCsv = (value: string) => `"${value.replaceAll('"', '""')}"`;
      const csvRows = [
        ['timestamp', 'severity', 'actor', 'actionType', 'targetType', 'targetId', 'summary', 'metadata'].map(escapeCsv).join(','),
        ...detailRows.map((item) => ([
          item.createdAt,
          item.severity,
          item.actor.username,
          item.actionType,
          item.targetType ?? '',
          item.targetId ?? '',
          item.summary,
          JSON.stringify(item.metadata ?? {}),
        ].map((value) => escapeCsv(String(value))).join(','))),
      ];
      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = `admin-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Logs exported');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to export logs');
    }
  };

  const openReportTarget = async (detail: AdminReportDetailResponse) => {
    const target = detail.targetPreview as AdminReportTargetPreview;
    if (target.kind === 'user') {
      const fallbackUserId = detail.targetUserId ?? target.id;
      setSelectedUser({
        id: fallbackUserId,
        username: target.label,
        fullName: target.label,
        email: target.email ?? '',
        college: 'GBPUAT',
        department: null,
        followers: 0,
        postsCount: 0,
        reportsCount: 0,
        lastActive: null,
        createdAt: new Date().toISOString(),
        suspendedUntil: null,
        status: (target.status as AdminUserStatus | undefined) ?? 'active',
        verified: Boolean(target.verified),
        avatarUrl: target.avatarUrl ?? null,
      });
      setUserActionForm({ note: '', durationDays: 7 });
      return;
    }

    if (target.kind === 'club') {
      await openClubDrawer({
        id: target.id,
        name: target.label,
        slug: target.slug ?? '',
        logoUrl: target.avatarUrl ?? null,
        members: 0,
        activityScore: 0,
        postsCount: 0,
        reports: 0,
        createdBy: '',
        verified: Boolean(target.verified),
        status: (target.status as AdminClubStatus | undefined) ?? 'active',
        createdAt: target.createdAt ?? new Date().toISOString(),
        lastActivity: target.createdAt ?? new Date().toISOString(),
      });
      return;
    }

    await openPostDrawer({
      id: target.id,
      author: target.authorUsername ?? 'Unknown author',
      authorUserId: target.authorUserId ?? detail.targetUserId ?? '',
      club: target.clubName ? { id: target.clubId ?? null, name: target.clubName, slug: null } : null,
      title: target.label,
      preview: target.preview ?? null,
      mediaUrl: null,
      engagement: { likes: 0, comments: 0, total: 0 },
      reportsCount: detail.reportFrequency,
      highestSeverity: detail.severity,
      hiddenReason: null,
      status: (target.status as AdminPostStatus | undefined) ?? 'live',
      createdAt: target.createdAt ?? new Date().toISOString(),
    });
  };

  const loadClubMembers = async (clubId: string, q = '') => {
    if (!token) return;
    const members = await apiAdminGet<AdminClubMember[]>(`/admin/clubs/${clubId}/members?q=${encodeURIComponent(q)}`, token);
    setClubMembers(members);
  };

  const loadAdminPostComments = async (postId: string, options?: { parentCommentId?: string; cursor?: string | null; append?: boolean }) => {
    if (!token) return;
    const params = new URLSearchParams();
    params.set('limit', '20');
    if (options?.parentCommentId) params.set('parentCommentId', options.parentCommentId);
    if (options?.cursor) params.set('cursor', options.cursor);
    const response = await apiAdminGet<AdminPostCommentsResponse>(`/admin/posts/${postId}/comments?${params.toString()}`, token);

    if (options?.parentCommentId) {
      const parentId = options.parentCommentId;
      setCommentRepliesByParentId((current) => ({
        ...current,
        [parentId]: options.append ? [...(current[parentId] ?? []), ...(response.comments ?? [])] : (response.comments ?? []),
      }));
      setCommentRepliesNextCursorByParentId((current) => ({
        ...current,
        [parentId]: response.nextCursor ?? null,
      }));
      return;
    }

    setSelectedPostComments((current) => (options?.append ? [...current, ...(response.comments ?? [])] : (response.comments ?? [])));
    setSelectedPostCommentsNextCursor(response.nextCursor ?? null);
  };

  const handlePasswordChange = async () => {
    if (!admin || !token) return;
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordState({ isSaving: false, message: '', error: 'Fill all password fields.' });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordState({ isSaving: false, message: '', error: 'New passwords do not match.' });
      return;
    }

    setPasswordState({ isSaving: true, message: '', error: '' });
    try {
      const verification = await apiVerifyPasswordChange(admin.userId, passwordForm.currentPassword, token);
      await apiChangePassword(admin.userId, { changeToken: verification.changeToken, newPassword: passwordForm.newPassword }, token);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setAdmin((current) => (current ? { ...current, mustChangePassword: false } : current));
      setPasswordState({ isSaving: false, message: 'Password changed successfully.', error: '' });
    } catch (error) {
      setPasswordState({ isSaving: false, message: '', error: error instanceof Error ? error.message : 'Unable to change password.' });
    }
  };

  const resetSettingsDraft = () => {
    setSettingsDraft(settings ? JSON.parse(JSON.stringify(settings)) as AdminSettingsResponse : null);
  };

  const handleSaveSettings = async () => {
    if (!token || !settingsDraft) return;
    setSettingsSaving(true);
    try {
      await apiAdminPost<AdminSettingsResponse>('/admin/settings', token, settingsDraft as AdminSettingsUpdatePayload, 'PATCH');
      toast.success('Operational settings updated');
      await refreshCurrentPage();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  const dashboardHealthSummary = useMemo(() => {
    const entries = dashboard?.health ?? [];
    if (entries.some((entry) => entry.tone === 'critical')) {
      return { label: 'Attention needed', tone: 'critical' as const };
    }
    if (entries.some((entry) => entry.tone === 'warning')) {
      return { label: 'Monitor services', tone: 'warning' as const };
    }
    if (entries.some((entry) => entry.tone === 'neutral')) {
      return { label: 'Partially configured', tone: 'neutral' as const };
    }
    return { label: 'All healthy', tone: 'healthy' as const };
  }, [dashboard]);

  const databaseLatencyEntry = useMemo(
    () => dashboard?.health.find((entry) => entry.key === 'databaseLatency') ?? null,
    [dashboard],
  );

  const dashboardMetricTarget = (metricKey: string): PageKey => {
    if (metricKey === 'totalUsers' || metricKey === 'activeUsers' || metricKey === 'newSignups') return 'users';
    if (metricKey === 'posts' || metricKey === 'activeChats') return 'posts';
    if (metricKey === 'activeClubs') return 'clubs';
    if (metricKey === 'pendingReports') return 'reports';
    if (metricKey === 'verificationRequests') return 'verification';
    return 'dashboard';
  };

  const openDashboardDrilldown = (metricKey: string) => {
    const targetPage = dashboardMetricTarget(metricKey);
    if (targetPage === 'dashboard') return;
    goTo(targetPage, { source: 'dashboard', metric: metricKey, range: dashboardRange });
  };

  const notificationCount = dashboard?.moderationQueue?.length ?? reports.filter((item) => ['open', 'reviewing', 'escalated'].includes(item.status)).length ?? 0;

  if (!token) return null;

  return (
    <div className="h-screen overflow-hidden bg-slate-100 text-slate-900">
      <aside
        style={{ width: collapsed ? 64 : 246 }}
        className="fixed inset-y-0 left-0 z-30 border-r border-slate-200 bg-slate-50 transition-all duration-200"
      >
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between">
                {!collapsed ? (
                  <div className="overflow-hidden">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">CampusLynk</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">Admin Console</p>
                  </div>
                ) : (
                  <div className="w-3" />
                )}
                <Button variant="ghost" size="icon" onClick={() => setCollapsed((value) => !value)}>
                  <ChevronRight className={`h-4 w-4 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                </Button>
              </div>
            </div>

              <nav className="flex-1 space-y-1 px-3 py-4">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = page === item.key;
                const base = `flex w-full items-center gap-3 rounded-md border text-sm transition `;
                const collapsedClasses = 'justify-center px-0 py-2';
                const expandedClasses = 'px-3 py-2 text-left';
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => goTo(item.key)}
                    onMouseEnter={() => prefetchPage(item.key)}
                    onFocus={() => prefetchPage(item.key)}
                    className={
                      base + (collapsed ? collapsedClasses : expandedClasses) +
                      (active ? ' border-slate-300 bg-white font-medium text-slate-900' : ' border-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-900')
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </button>
                );
              })}
            </nav>

            <div className="border-t border-slate-200 p-3">
              <div className={collapsed ? 'flex items-center justify-center py-3' : 'rounded-lg border border-slate-200 bg-white p-3'}>
                {!collapsed ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                        {admin?.username ? admin.username.slice(0, 2).toUpperCase() : 'AD'}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{admin?.username ?? 'Loading...'}</p>
                        <p className="truncate text-xs text-slate-500">{admin?.role ? admin.role.replace('_', ' ') : ''}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="mt-3 w-full justify-start border-slate-200 text-slate-700" onClick={handleLogout}>
                      <LogOut className="h-4 w-4" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full border border-slate-200 bg-white text-slate-700" onClick={handleLogout}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div
          style={{ marginLeft: collapsed ? 84 : 246 }}
          className="relative z-0 flex h-screen min-h-0 flex-col overflow-hidden transition-all duration-200"
        >
          <header
            className="sticky top-0 z-40 isolate border-b border-slate-200 shadow-sm"
            style={{ backgroundColor: '#ffffff', opacity: 1 }}
          >
            <div className="flex items-center gap-4 px-6 py-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-slate-900">{pageTitle}</h1>
                <p className="mt-1 text-xs text-slate-500">
                  {page === 'dashboard' && dashboard
                    ? `${formatRangeLabel(dashboard.range)} · ${databaseLatencyEntry?.value ?? 'DB probe unavailable'} · Updated ${formatDate(dashboard.generatedAt)}`
                    : dashboardContext.source === 'dashboard'
                      ? `Opened from dashboard · ${formatRangeLabel(dashboardRange)}`
                      : 'Operational visibility for CampusLynk.'}
                </p>
              </div>

              <div className="relative hidden w-[320px] xl:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none z-10" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search current page"
                  className="h-10 rounded-md border-slate-300 bg-slate-50 pl-10"
                />
              </div>

              <div className="hidden items-center gap-2 lg:flex">
                {page === 'dashboard' ? (
                  <>
                    <Badge variant="outline" className={dashboardHealthSummary.tone === 'critical' ? 'border-red-200 bg-red-50 text-red-700' : dashboardHealthSummary.tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : dashboardHealthSummary.tone === 'neutral' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                      {dashboardHealthSummary.label}
                    </Badge>
                    <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                      {formatNumber(dashboard?.metrics?.find((metric) => metric.key === 'activeUsers')?.value ?? 0)} active in range
                    </Badge>
                  </>
                ) : null}
                {pageRefreshing ? <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">Refreshing...</Badge> : null}
              </div>

              <button type="button" onClick={() => goTo('reports')} className="relative rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-white">
                <Bell className="h-4 w-4" />
                {notificationCount ? <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{notificationCount}</span> : null}
              </button>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6">
            <div className="space-y-6">
            {pageLoading ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
                ))}
              </div>
            ) : null}

            {!pageLoading && page !== 'dashboard' && dashboardContext.source === 'dashboard' ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                Dashboard drilldown: {dashboardContext.metric ?? 'overview'} · {formatRangeLabel(dashboardRange)}
              </div>
            ) : null}

            {!pageLoading && page === 'dashboard' ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                  {DASHBOARD_RANGES.map((rangeOption) => {
                    const isActive = dashboardRange === rangeOption;
                    return (
                      <button
                        key={rangeOption}
                        type="button"
                        onClick={() => goTo('dashboard', { range: rangeOption })}
                        aria-pressed={isActive}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${isActive ? '' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
                        style={
                          isActive
                            ? {
                                backgroundColor: '#dbeafe',
                                border: '1px solid #93c5fd',
                                color: '#1e3a8a',
                                boxShadow: '0 1px 2px rgba(59, 130, 246, 0.16)',
                              }
                            : undefined
                        }
                      >
                        {rangeOption.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">Time range</p>
              </div>
            ) : null}

            {!pageLoading && page === 'dashboard' && dashboard ? (
              <>
                <div className="grid gap-4 xl:grid-cols-4">
                  {dashboard.metrics.map((metric) => (
                    <button
                      key={metric.key}
                      type="button"
                      onClick={() => openDashboardDrilldown(metric.key)}
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{metric.title}</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(metric.value)}</p>
                        </div>
                        <TrendBadge label={metric.trendLabel} direction={metric.trendDirection} />
                      </div>
                      <div className="mt-4">
                        <MiniSparkline values={metric.series ?? []} />
                      </div>
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
                  <div className="grid gap-4">
                    <ShellCard title="Activity Charts">
                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-md border border-slate-200 p-3">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Daily active users</p>
                          <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={dashboard.charts?.dailyActiveUsers ?? []}>
                                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Line dataKey="value" stroke="#0f172a" strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                        <div className="rounded-md border border-slate-200 p-3">
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Posts per day</p>
                          <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={dashboard.charts?.postsPerDay ?? []}>
                                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </ShellCard>

                    <ShellCard title="Moderation Queue" action={<Button variant="outline" size="sm" onClick={() => goTo('reports')}>Open reports</Button>}>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                              <th className="px-3 py-3 whitespace-nowrap">Reported item</th>
                              <th className="px-3 py-3 whitespace-nowrap">User</th>
                              <th className="px-3 py-3 whitespace-nowrap">Reason</th>
                              <th className="px-3 py-3 whitespace-nowrap">Severity</th>
                              <th className="px-3 py-3 whitespace-nowrap">Count</th>
                              <th className="px-3 py-3 whitespace-nowrap">Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dashboard.moderationQueue ?? []).map((item: any) => (
                              <tr key={item.id} className="border-b border-slate-100 align-top">
                                <td className="px-3 py-3 font-medium text-slate-800">{item.reportedItem}</td>
                                <td className="px-3 py-3 text-slate-600">{item.user}</td>
                                <td className="px-3 py-3 text-slate-600">{item.reason}</td>
                                <td className="px-3 py-3"><StatusBadge value={item.severity} /></td>
                                <td className="px-3 py-3 text-slate-600">{item.reportsCount}</td>
                                <td className="px-3 py-3 text-slate-500">{formatDate(item.time)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </ShellCard>
                  </div>

                  <div className="grid gap-4">
                    <ShellCard title="Live Activity Feed">
                      <div className="max-h-[360px] space-y-3 overflow-y-auto">
                        {(dashboard.activityFeed ?? []).map((item: any) => (
                          <div key={item.id} className="rounded-md border border-slate-200 px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-slate-800">{item.description}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.1em] text-slate-500">{item.type}</p>
                              </div>
                              <p className="text-xs text-slate-500">{formatDate(item.timestamp)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ShellCard>

                    <ShellCard title="Platform Health">
                      <div className="space-y-3">
                        {(dashboard.health ?? []).map((entry) => (
                          <div key={entry.key} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                            <span className="text-sm text-slate-600">{entry.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{entry.value}</span>
                              <StatusBadge value={entry.tone} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </ShellCard>
                  </div>
                </div>
              </>
            ) : null}

            {!pageLoading && page === 'users' ? (
              <>
                <ShellCard title="User Filters">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={userFilters.status} onChange={(event) => setUserFilters((current) => ({ ...current, status: event.target.value as UserFilterState['status'], page: 1 }))}>
                      {USER_STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={userFilters.verified} onChange={(event) => setUserFilters((current) => ({ ...current, verified: event.target.value as UserFilterState['verified'], page: 1 }))}>
                      {USER_BOOLEAN_OPTIONS.map((option) => <option key={`verified-${option.label}`} value={option.value}>{`Verified: ${option.label}`}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={userFilters.banned} onChange={(event) => setUserFilters((current) => ({ ...current, banned: event.target.value as UserFilterState['banned'], page: 1 }))}>
                      {USER_BOOLEAN_OPTIONS.map((option) => <option key={`banned-${option.label}`} value={option.value}>{`Banned: ${option.label}`}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={userFilters.department} onChange={(event) => setUserFilters((current) => ({ ...current, department: event.target.value, page: 1 }))}>
                      <option value="">All departments</option>
                      {userFilterOptions.departments.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={userFilters.sort} onChange={(event) => setUserFilters((current) => ({ ...current, sort: event.target.value as AdminUserSortKey, page: 1 }))}>
                      {USER_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={userFilters.order} onChange={(event) => setUserFilters((current) => ({ ...current, order: event.target.value as AdminSortOrder, page: 1 }))}>
                      <option value="desc">Newest first</option>
                      <option value="asc">Oldest first</option>
                    </select>
                  </div>
                </ShellCard>

                <ShellCard
                  title="User Management"
                  action={
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={selectedUserIds.length === 0} onClick={() => selectedUserIds.forEach((id) => void runUserAction(id, 'verify'))}>Bulk verify</Button>
                      <Button variant="outline" size="sm" disabled={selectedUserIds.length === 0} onClick={() => selectedUserIds.forEach((id) => void runUserAction(id, 'suspend', { durationDays: 7 }))}>Bulk suspend</Button>
                    </div>
                  }
                >
                  {currentPageQuery.isError ? (
                    <EmptyPanel title="Unable to load users" body={currentPageQuery.error instanceof Error ? currentPageQuery.error.message : 'Try refreshing this page.'} />
                  ) : users.length === 0 ? (
                    <EmptyPanel title="No users matched these filters" body="Adjust the search or filters to broaden the results." />
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                        <span>{formatNumber(usersPageInfo?.total ?? 0)} users found</span>
                        <span>Page {usersPageInfo?.page ?? 1} of {usersPageInfo?.totalPages ?? 1}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                              <th className="px-3 py-3 whitespace-nowrap"></th>
                              <th className="px-3 py-3 whitespace-nowrap">User</th>
                              <th className="px-3 py-3 whitespace-nowrap">Department</th>
                              <th className="px-3 py-3 whitespace-nowrap">Followers</th>
                              <th className="px-3 py-3 whitespace-nowrap">Posts</th>
                              <th className="px-3 py-3 whitespace-nowrap">Reports</th>
                              <th className="px-3 py-3 whitespace-nowrap">Last active</th>
                              <th className="px-3 py-3 whitespace-nowrap">Status</th>
                              <th className="px-3 py-3 whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.map((user) => (
                              <tr key={user.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-3">
                                  <input
                                    type="checkbox"
                                    checked={selectedUserIds.includes(user.id)}
                                    onChange={(event) => {
                                      setSelectedUserIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id));
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <button
                                    type="button"
                                    onClick={() => openUserDrawer(user)}
                                    onMouseEnter={() => prefetchUserDetail(user.id)}
                                    onFocus={() => prefetchUserDetail(user.id)}
                                    className="text-left"
                                  >
                                    <p className="font-medium text-slate-800">{user.username}</p>
                                    <p className="text-xs text-slate-500">{user.email}</p>
                                  </button>
                                </td>
                                <td className="px-3 py-3 text-slate-600">{user.department || 'Unknown'}</td>
                                <td className="px-3 py-3 text-slate-600">{formatNumber(user.followers)}</td>
                                <td className="px-3 py-3 text-slate-600">{formatNumber(user.postsCount)}</td>
                                <td className="px-3 py-3 text-slate-600">{formatNumber(user.reportsCount)}</td>
                                <td className="px-3 py-3 text-slate-500">{formatDate(user.lastActive)}</td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <StatusBadge value={user.status} />
                                    <StatusBadge value={user.verified ? 'verified' : 'unverified'} />
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    {getUserActionOptions(user).map((option) => (
                                      <Button
                                        key={option.action}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => void runUserAction(user.id, option.action, option.action === 'suspend' ? { durationDays: 7 } : undefined)}
                                      >
                                        {option.label}
                                      </Button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>Rows per page</span>
                          <select className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" value={userFilters.limit} onChange={(event) => setUserFilters((current) => ({ ...current, limit: Number(event.target.value), page: 1 }))}>
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={!usersPageInfo?.hasPreviousPage} onClick={() => setUserFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}>Previous</Button>
                          <Button variant="outline" size="sm" disabled={!usersPageInfo?.hasNextPage} onClick={() => setUserFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</Button>
                        </div>
                      </div>
                    </>
                  )}
                  </ShellCard>
              </>
            ) : null}

            {!pageLoading && page === 'clubs' ? (
              <>
                <ShellCard title="Club Filters">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={clubFilters.status} onChange={(event) => setClubFilters((current) => ({ ...current, status: event.target.value as ClubFilterState['status'], page: 1 }))}>
                      {CLUB_STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={clubFilters.verified} onChange={(event) => setClubFilters((current) => ({ ...current, verified: event.target.value as ClubFilterState['verified'], page: 1 }))}>
                      {USER_BOOLEAN_OPTIONS.map((option) => <option key={`club-verified-${option.label}`} value={option.value}>{`Verified: ${option.label}`}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={clubFilters.sort} onChange={(event) => setClubFilters((current) => ({ ...current, sort: event.target.value as AdminClubSortKey, page: 1 }))}>
                      {CLUB_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={clubFilters.order} onChange={(event) => setClubFilters((current) => ({ ...current, order: event.target.value as AdminSortOrder, page: 1 }))}>
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </div>
                </ShellCard>

                <ShellCard title="Club Management">
                  {currentPageQuery.isError ? (
                    <EmptyPanel title="Unable to load clubs" body={currentPageQuery.error instanceof Error ? currentPageQuery.error.message : 'Try refreshing this page.'} />
                  ) : clubs.length === 0 ? (
                    <EmptyPanel title="No clubs matched these filters" body="Adjust the search or filters to broaden the results." />
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                        <span>{formatNumber(clubsPageInfo?.total ?? 0)} clubs found</span>
                        <span>Page {clubsPageInfo?.page ?? 1} of {clubsPageInfo?.totalPages ?? 1}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                              <th className="px-3 py-3 whitespace-nowrap">Club</th>
                              <th className="px-3 py-3 whitespace-nowrap">Members</th>
                              <th className="px-3 py-3 whitespace-nowrap">Posts</th>
                              <th className="px-3 py-3 whitespace-nowrap">Reports</th>
                              <th className="px-3 py-3 whitespace-nowrap">Created by</th>
                              <th className="px-3 py-3 whitespace-nowrap">Status</th>
                              <th className="px-3 py-3 whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {clubs.map((club: AdminClubListItem) => (
                              <tr key={club.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-3">
                                  <button type="button" onClick={() => void openClubDrawer(club)} className="text-left">
                                    <p className="font-medium text-slate-800">{club.name}</p>
                                    <p className="text-xs text-slate-500">{club.slug}</p>
                                  </button>
                                </td>
                                <td className="px-3 py-3 text-slate-600">{formatNumber(club.members)}</td>
                                <td className="px-3 py-3 text-slate-600">{formatNumber(club.postsCount)}</td>
                                <td className="px-3 py-3 text-slate-600">{formatNumber(club.reports)}</td>
                                <td className="px-3 py-3 text-slate-600">{club.createdBy}</td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <StatusBadge value={club.status} />
                                    <StatusBadge value={club.verified ? 'verified' : 'unverified'} />
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    {getClubActionOptions(club).map((option) => (
                                      <Button key={option.action} variant="outline" size="sm" onClick={() => void runClubAction(club.id, option.action)}>
                                        {option.label}
                                      </Button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>Rows per page</span>
                          <select className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" value={clubFilters.limit} onChange={(event) => setClubFilters((current) => ({ ...current, limit: Number(event.target.value), page: 1 }))}>
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={!clubsPageInfo?.hasPreviousPage} onClick={() => setClubFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}>Previous</Button>
                          <Button variant="outline" size="sm" disabled={!clubsPageInfo?.hasNextPage} onClick={() => setClubFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</Button>
                        </div>
                      </div>
                    </>
                  )}
                </ShellCard>
              </>
            ) : null}

            {!pageLoading && page === 'posts' ? (
              <>
                <ShellCard title="Post Filters">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={postFilters.status} onChange={(event) => setPostFilters((current) => ({ ...current, status: event.target.value as PostFilterState['status'], page: 1 }))}>
                      {POST_STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={postFilters.severity} onChange={(event) => setPostFilters((current) => ({ ...current, severity: event.target.value as AdminPostSeverity, page: 1 }))}>
                      {POST_SEVERITY_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                    <Input
                      className="h-10"
                      placeholder="Filter by club name"
                      value={postFilters.club}
                      onChange={(event) => setPostFilters((current) => ({ ...current, club: event.target.value, page: 1 }))}
                    />
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={postFilters.sort} onChange={(event) => setPostFilters((current) => ({ ...current, sort: event.target.value as AdminPostSortKey, page: 1 }))}>
                      {POST_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={postFilters.order} onChange={(event) => setPostFilters((current) => ({ ...current, order: event.target.value as AdminSortOrder, page: 1 }))}>
                      <option value="desc">Descending</option>
                      <option value="asc">Ascending</option>
                    </select>
                  </div>
                </ShellCard>

                <ShellCard title="Post Moderation">
                  {currentPageQuery.isError ? (
                    <EmptyPanel title="Unable to load posts" body={currentPageQuery.error instanceof Error ? currentPageQuery.error.message : 'Try refreshing this page.'} />
                  ) : posts.length === 0 ? (
                    <EmptyPanel title="No posts matched these filters" body="Adjust the search or filters to broaden the results." />
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                        <span>{formatNumber(postsPageInfo?.total ?? 0)} posts found</span>
                        <span>Page {postsPageInfo?.page ?? 1} of {postsPageInfo?.totalPages ?? 1}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                              <th className="px-3 py-3 whitespace-nowrap">Post</th>
                              <th className="px-3 py-3 whitespace-nowrap">Author</th>
                              <th className="px-3 py-3 whitespace-nowrap">Engagement</th>
                              <th className="px-3 py-3 whitespace-nowrap">Reports</th>
                              <th className="px-3 py-3 whitespace-nowrap">Status</th>
                              <th className="px-3 py-3 whitespace-nowrap">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {posts.map((post) => (
                              <tr key={post.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-3">
                                  <button type="button" onClick={() => void openPostDrawer(post)} className="text-left">
                                    <p className="font-medium text-slate-800">{post.title || 'Untitled post'}</p>
                                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.preview || 'No content preview available.'}</p>
                                  </button>
                                </td>
                                <td className="px-3 py-3 text-slate-600">
                                  <p>{post.author}</p>
                                  <p className="mt-1 text-xs text-slate-500">{post.club?.name ?? 'Independent post'}</p>
                                </td>
                                <td className="px-3 py-3 text-slate-600">
                                  <p>{formatNumber(post.engagement.likes)} likes</p>
                                  <p className="mt-1 text-xs text-slate-500">{formatNumber(post.engagement.comments)} comments</p>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <span className="text-slate-600">{formatNumber(post.reportsCount)}</span>
                                    {post.highestSeverity ? <StatusBadge value={post.highestSeverity} /> : null}
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <StatusBadge value={post.status} />
                                    {post.mediaUrl ? <Badge variant="outline">Media</Badge> : null}
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <Button variant="outline" size="sm" onClick={() => void openPostDrawer(post)}>Review</Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>Rows per page</span>
                          <select className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" value={postFilters.limit} onChange={(event) => setPostFilters((current) => ({ ...current, limit: Number(event.target.value), page: 1 }))}>
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={!postsPageInfo?.hasPreviousPage} onClick={() => setPostFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}>Previous</Button>
                          <Button variant="outline" size="sm" disabled={!postsPageInfo?.hasNextPage} onClick={() => setPostFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</Button>
                        </div>
                      </div>
                    </>
                  )}
                </ShellCard>
              </>
            ) : null}

            {!pageLoading && page === 'reports' ? (
              <>
                <ShellCard title="Report Filters">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={reportFilters.status} onChange={(event) => setReportFilters((current) => ({ ...current, status: event.target.value as ReportFilterState['status'], page: 1 }))}>
                      {REPORT_STATUS_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={reportFilters.severity} onChange={(event) => setReportFilters((current) => ({ ...current, severity: event.target.value as ReportFilterState['severity'], page: 1 }))}>
                      {REPORT_SEVERITY_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={reportFilters.targetType} onChange={(event) => setReportFilters((current) => ({ ...current, targetType: event.target.value as ReportFilterState['targetType'], page: 1 }))}>
                      {REPORT_TARGET_OPTIONS.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={reportFilters.assignee} onChange={(event) => setReportFilters((current) => ({ ...current, assignee: event.target.value as ReportFilterState['assignee'], page: 1 }))}>
                      {REPORT_ASSIGNEE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <Input className="h-10" type="date" value={reportFilters.from} onChange={(event) => setReportFilters((current) => ({ ...current, from: event.target.value, page: 1 }))} />
                    <Input className="h-10" type="date" value={reportFilters.to} onChange={(event) => setReportFilters((current) => ({ ...current, to: event.target.value, page: 1 }))} />
                  </div>
                </ShellCard>

                <ShellCard title="Reports Queue">
                  {currentPageQuery.isError ? (
                    <EmptyPanel title="Unable to load reports" body={currentPageQuery.error instanceof Error ? currentPageQuery.error.message : 'Try refreshing this page.'} />
                  ) : reports.length === 0 ? (
                    <EmptyPanel title="No reports matched these filters" body="Adjust the search or filters to broaden the queue." />
                  ) : (
                    <>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
                        <span>{formatNumber(reportsPageInfo?.total ?? 0)} reports found</span>
                        <span>Page {reportsPageInfo?.page ?? 1} of {reportsPageInfo?.totalPages ?? 1}</span>
                      </div>
                      <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                        <th className="px-3 py-3 whitespace-nowrap">Reporter</th>
                        <th className="px-3 py-3 whitespace-nowrap">Target</th>
                        <th className="px-3 py-3 whitespace-nowrap">Reason</th>
                        <th className="px-3 py-3 whitespace-nowrap">Evidence</th>
                        <th className="px-3 py-3 whitespace-nowrap">Assignee</th>
                        <th className="px-3 py-3 whitespace-nowrap">Frequency</th>
                        <th className="px-3 py-3 whitespace-nowrap">Status</th>
                        <th className="px-3 py-3 whitespace-nowrap">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                          <td className="px-3 py-3 text-slate-700">
                            <p>{report.reporter}</p>
                            <p className="mt-1 text-xs text-slate-500">{formatDate(report.createdAt)}</p>
                          </td>
                          <td className="px-3 py-3 text-slate-600">
                            <p className="font-medium text-slate-800">{report.targetLabel}</p>
                            <p className="mt-1 text-xs text-slate-500">{getReportTargetKindLabel(report.targetType)}</p>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{report.reason}</td>
                          <td className="px-3 py-3 text-slate-500">{report.evidence || '—'}</td>
                          <td className="px-3 py-3 text-slate-600">{report.assignedModerator || 'Unassigned'}</td>
                          <td className="px-3 py-3 text-slate-600">{formatNumber(report.reportFrequency)}</td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <StatusBadge value={report.severity} />
                              <StatusBadge value={report.status} />
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => void openReportDrawer(report)}>Open</Button>
                              {report.status !== 'reviewing' ? (
                                <Button variant="outline" size="sm" onClick={() => void runReportAction(report.id, { status: 'reviewing', assignToMe: true }, 'Report assigned and moved to review')}>Review</Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>Rows per page</span>
                          <select className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" value={reportFilters.limit} onChange={(event) => setReportFilters((current) => ({ ...current, limit: Number(event.target.value), page: 1 }))}>
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={!reportsPageInfo?.hasPreviousPage} onClick={() => setReportFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}>Previous</Button>
                          <Button variant="outline" size="sm" disabled={!reportsPageInfo?.hasNextPage} onClick={() => setReportFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</Button>
                        </div>
                      </div>
                    </>
                  )}
                  </ShellCard>
              </>
            ) : null}

            {!pageLoading && page === 'verification' ? (
              <div className="relative">
                <ShellCard title="Verification Queue">
                  {verification.length === 0 ? (
                    <EmptyPanel title="No verification requests" body="New alumni or club verification requests will appear here." />
                  ) : (
                    <div className="space-y-3">
                      {verification.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedVerificationId(item.id);
                            setHasOpenedVerificationRequest(true);
                          }}
                          className={`w-full rounded-lg border p-4 text-left transition ${
                            selectedVerification?.id === item.id && hasOpenedVerificationRequest
                              ? 'border-slate-900 bg-slate-50 shadow-sm'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{item.type} verification</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {item.targetSummary?.label ?? item.profilePreview?.name ?? 'Unknown target'}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">Requested {formatDate(item.requestedAt)}</p>
                            </div>
                            <StatusBadge value={item.status} />
                          </div>
                          <p className="mt-3 text-sm text-slate-600 line-clamp-2">
                            {item.notes || item.decisionNote || 'No verification notes provided.'}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </ShellCard>

                {selectedVerification && hasOpenedVerificationRequest ? (
                  <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/30 p-4 sm:p-6">
                    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
                        <div className="min-w-0">
                          <p className="text-2xl font-semibold leading-tight text-slate-900">
                            {selectedVerification.targetSummary?.label ?? selectedVerification.profilePreview?.name ?? 'Verification request'}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {selectedVerification.type} verification
                            {selectedVerification.verificationState ? ` • ${selectedVerification.verificationState}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 pl-4">
                          <StatusBadge value={selectedVerification.status} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setHasOpenedVerificationRequest(false);
                              setSelectedVerificationId(null);
                            }}
                          >
                            Close
                          </Button>
                        </div>
                      </div>

                      <div className="max-h-[calc(90vh-6rem)] space-y-4 overflow-y-auto p-4 sm:p-6">
                        <div className="grid items-start gap-4 md:grid-cols-2">
                          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 p-4 sm:p-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Applicant Summary</p>
                            <div className="mt-3 space-y-4 text-sm leading-6 text-slate-700">
                              <p><span className="font-medium text-slate-900">Name:</span> {selectedVerification.profilePreview?.name ?? selectedVerification.targetSummary?.label ?? 'Unknown'}</p>
                              <p><span className="font-medium text-slate-900">Email:</span> {selectedVerification.profilePreview?.email ?? selectedVerification.targetSummary?.email ?? 'Unknown'}</p>
                              <p><span className="font-medium text-slate-900">Branch:</span> {selectedVerification.profilePreview?.branch ?? 'Not provided'}</p>
                              <p><span className="font-medium text-slate-900">Passing year:</span> {selectedVerification.profilePreview?.passingYear ?? 'Not provided'}</p>
                              <p><span className="font-medium text-slate-900">Current status:</span> {selectedVerification.profilePreview?.currentStatus ?? 'Not provided'}</p>
                            </div>
                          </div>

                          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 p-4 sm:p-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Target Summary</p>
                            <div className="mt-3 space-y-4 text-sm leading-6 text-slate-700">
                              <p><span className="font-medium text-slate-900">Type:</span> {selectedVerification.targetSummary?.kind ?? 'Unknown'}</p>
                              <p><span className="font-medium text-slate-900">Label:</span> {selectedVerification.targetSummary?.label ?? 'Unknown'}</p>
                              {'email' in (selectedVerification.targetSummary ?? {}) ? (
                                <p><span className="font-medium text-slate-900">Email:</span> {selectedVerification.targetSummary?.email ?? 'Unknown'}</p>
                              ) : null}
                              <p><span className="font-medium text-slate-900">Reviewed by:</span> {selectedVerification.reviewedBy?.username ?? 'Not reviewed yet'}</p>
                              <p><span className="font-medium text-slate-900">Reviewed at:</span> {selectedVerification.reviewedAt ? formatDate(selectedVerification.reviewedAt) : 'Not reviewed yet'}</p>
                            </div>
                          </div>
                        </div>

                        <div className="overflow-hidden rounded-xl border border-slate-200 p-4 sm:p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Submitted Proof</p>
                          {selectedVerification.documentUrls.length === 0 ? (
                            <p className="mt-3 text-sm leading-6 text-slate-500">No proof documents uploaded.</p>
                          ) : (
                            <div className="mt-5 grid gap-4 md:grid-cols-2">
                              {selectedVerification.documentUrls.map((url, index) => {
                                const isImage = /\.(png|jpe?g|webp|gif)$/i.test(url);
                                return (
                                  <a
                                    key={`${selectedVerification.id}-proof-${index}`}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block min-w-0 rounded-lg border border-slate-200 p-4 transition hover:border-slate-300"
                                  >
                                    {isImage ? <img src={url} alt={`Proof ${index + 1}`} className="h-36 w-full rounded-lg object-cover" /> : null}
                                    <p className="mt-2 text-sm font-medium text-slate-800">Proof {index + 1}</p>
                                    <p className="mt-2 break-all text-xs leading-6 text-slate-500">{url}</p>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="overflow-hidden rounded-xl border border-slate-200 p-4 sm:p-5">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Request Notes</p>
                          <p className="mt-3 text-sm leading-6 text-slate-700">
                            {selectedVerification.notes || 'No applicant notes provided.'}
                          </p>
                        </div>

                        {selectedVerification.status === 'pending' ? (
                          <div className="overflow-hidden rounded-xl border border-slate-200 p-4 sm:p-5">
                            <Label htmlFor="verification-decision-note" className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                              Reviewer Decision Note
                            </Label>
                            <Textarea
                              id="verification-decision-note"
                              value={verificationDecisionNote}
                              onChange={(event) => setVerificationDecisionNote(event.target.value)}
                              className="mt-3 min-h-[120px]"
                              placeholder="Add the reason for approval, rejection, or more-information request."
                            />
                          </div>
                        ) : null}

                        {getVerificationActionOptions(selectedVerification).length > 0 ? (
                          <div className="flex flex-wrap gap-3 pt-1">
                            {getVerificationActionOptions(selectedVerification).map((action) => (
                              <Button key={action.status} variant="outline" size="sm" onClick={() => void runVerificationAction(action.status)}>
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                            This verification request has already been reviewed and is now read-only.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {!pageLoading && page === 'analytics' && analytics ? (
              <div className="space-y-4">
                <ShellCard title="Analytics Controls">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      {DASHBOARD_RANGES.map((rangeOption) => (
                        <Button
                          key={`analytics-${rangeOption}`}
                          variant={dashboardRange === rangeOption ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setDashboardRange(rangeOption)}
                        >
                          {formatRangeLabel(rangeOption)}
                        </Button>
                      ))}
                    </div>
                    <select
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                      value={analyticsSegment}
                      onChange={(event) => setAnalyticsSegment(event.target.value as AdminAnalyticsSegment)}
                    >
                      {ANALYTICS_SEGMENTS.map((segment) => (
                        <option key={segment} value={segment}>
                          {segment === 'all' ? 'All users' : segment === 'students' ? 'Students only' : 'Alumni only'}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">Generated {formatDate(analytics.generatedAt)}</span>
                  </div>
                </ShellCard>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {analytics.summary.map((metric) => (
                    <div key={metric.key} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                      <p className="mt-3 text-2xl font-semibold text-slate-900">{formatNumber(metric.value)}</p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <ShellCard title="User Growth">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={analytics.userGrowth}>
                          <CartesianGrid stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Line dataKey="value" stroke="#0f172a" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </ShellCard>

                  <ShellCard title="Engagement Activity">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={analytics.engagement}>
                          <CartesianGrid stroke="#e2e8f0" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip />
                          <Bar dataKey="posts" fill="#0f172a" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="comments" fill="#475569" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="likes" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </ShellCard>

                  <ShellCard title="Retention Cohorts">
                    <div className="space-y-3">
                      {analytics.retention.length === 0 ? (
                        <EmptyPanel title="No retention cohorts yet" body="Retention will appear once enough user and session history exists in the selected range." />
                      ) : analytics.retention.map((cohort) => (
                        <div key={cohort.cohortLabel} className="rounded-xl border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-slate-800">{cohort.cohortLabel}</p>
                              <p className="mt-1 text-xs text-slate-500">{formatNumber(cohort.cohortSize)} users</p>
                            </div>
                            <div className="text-right text-sm text-slate-700">
                              <p>Week 1: {cohort.week1Rate == null ? 'N/A' : `${cohort.week1Rate}%`}</p>
                              <p className="mt-1 text-xs text-slate-500">Week 4: {cohort.week4Rate == null ? 'N/A' : `${cohort.week4Rate}%`}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ShellCard>

                  <ShellCard title="Device Breakdown">
                    <div className="space-y-2">
                      {analytics.deviceBreakdown.length === 0 ? (
                        <EmptyPanel title="No session device data" body="Active session platform data will appear here." />
                      ) : analytics.deviceBreakdown.map((item) => (
                        <div key={item.label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                          <span className="text-sm text-slate-700">{item.label}</span>
                          <span className="text-sm font-medium text-slate-900">{formatNumber(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </ShellCard>

                  <ShellCard title="Active Departments">
                    <div className="space-y-2">
                      {analytics.activeDepartments.length === 0 ? (
                        <EmptyPanel title="No department data" body="Department aggregation will appear here when profile data is present." />
                      ) : analytics.activeDepartments.map((item) => (
                        <div key={item.label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                          <span className="text-sm text-slate-700">{item.label}</span>
                          <span className="text-sm font-medium text-slate-900">{formatNumber(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </ShellCard>

                  <ShellCard title="Top Clubs">
                    <div className="space-y-2">
                      {analytics.topClubs.length === 0 ? (
                        <EmptyPanel title="No club engagement data" body="Club rankings will appear when club activity exists in the selected range." />
                      ) : analytics.topClubs.map((club) => (
                        <div key={club.id} className="rounded-md border border-slate-200 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-800">{club.label}</span>
                            <span className="text-sm font-semibold text-slate-900">{formatNumber(club.engagement)}</span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">
                            {formatNumber(club.posts)} posts · {formatNumber(club.comments)} comments · {formatNumber(club.likes)} likes
                          </p>
                        </div>
                      ))}
                    </div>
                  </ShellCard>

                  <ShellCard title="Content Performance">
                    <div className="space-y-2">
                      {analytics.contentPerformance.length === 0 ? (
                        <EmptyPanel title="No content performance data" body="Content rankings will appear when posts exist in the selected range." />
                      ) : analytics.contentPerformance.map((item) => (
                        <div key={item.id} className="rounded-md border border-slate-200 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-slate-800">{item.title}</span>
                            <span className="text-sm font-semibold text-slate-900">{formatNumber(item.engagement)}</span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">{item.subtitle}</p>
                          <p className="mt-2 text-xs text-slate-500">
                            {formatNumber(item.likes)} likes · {formatNumber(item.comments)} comments · {formatDate(item.createdAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </ShellCard>

                  <ShellCard title="Trending Hashtags">
                    <div className="space-y-2">
                      {analytics.trendingHashtags.length === 0 ? (
                        <EmptyPanel title="No hashtag trends yet" body="Trending hashtags will appear once enough tagged activity exists." />
                      ) : analytics.trendingHashtags.map((item) => (
                        <div key={`${item.label}-${item.tag}`} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                          <div>
                            <span className="text-sm font-medium text-slate-800">#{item.tag}</span>
                            <p className="mt-1 text-xs text-slate-500">{item.label}</p>
                          </div>
                          <span className="text-sm font-semibold text-slate-900">{formatNumber(item.postCount)}</span>
                        </div>
                      ))}
                    </div>
                  </ShellCard>
                </div>
              </div>
            ) : null}

            {!pageLoading && page === 'announcements' ? (
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <ShellCard title={selectedAnnouncement ? 'Edit Announcement' : 'Create Announcement'}>
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          placeholder="Announcement title"
                          value={announcementDraft.title}
                          onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))}
                        />
                        <select
                          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                          value={announcementDraft.audienceType}
                          onChange={(event) => setAnnouncementDraft((current) => ({ ...current, audienceType: event.target.value as AnnouncementDraftState['audienceType'], audienceIds: [] }))}
                        >
                          <option value="all_users">All users</option>
                          <option value="specific_clubs">Specific clubs</option>
                          <option value="specific_branches">Specific branches</option>
                        </select>
                      </div>
                      <Textarea
                        rows={8}
                        placeholder="Announcement body"
                        value={announcementDraft.content}
                        onChange={(event) => setAnnouncementDraft((current) => ({ ...current, content: event.target.value }))}
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          type="datetime-local"
                          value={announcementDraft.scheduledFor}
                          onChange={(event) => setAnnouncementDraft((current) => ({ ...current, scheduledFor: event.target.value }))}
                        />
                        <div className="flex flex-wrap items-center gap-4 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={announcementDraft.pinned}
                              onChange={(event) => setAnnouncementDraft((current) => ({ ...current, pinned: event.target.checked }))}
                            />
                            Pin announcement
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={announcementDraft.pushEnabled}
                              onChange={(event) => setAnnouncementDraft((current) => ({ ...current, pushEnabled: event.target.checked }))}
                            />
                            Push notification
                          </label>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Audience Targeting</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {announcementDraft.audienceType === 'all_users'
                                ? 'This announcement will target the entire current user base.'
                                : announcementDraft.audienceType === 'specific_clubs'
                                  ? 'Select one or more clubs to reach their active members.'
                                  : 'Select one or more branches to target matching student and alumni profiles.'}
                            </p>
                          </div>
                          <Badge variant="outline">{formatNumber(announcementRecipientCount)} recipients</Badge>
                        </div>
                        {announcementDraft.audienceType === 'all_users' ? (
                          <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            All current users are included. No additional selectors are needed.
                          </div>
                        ) : (
                          <div className="mt-4">
                            {(announcementDraft.audienceType === 'specific_clubs' ? announcementOptions.clubs : announcementOptions.branches).length === 0 ? (
                              <EmptyPanel
                                title={announcementDraft.audienceType === 'specific_clubs' ? 'No clubs available' : 'No branches available'}
                                body={announcementDraft.audienceType === 'specific_clubs'
                                  ? 'Club options will appear here once club data is available.'
                                  : 'Branch options will appear here once profile branch data exists.'}
                              />
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {(announcementDraft.audienceType === 'specific_clubs' ? announcementOptions.clubs : announcementOptions.branches).map((option) => {
                                  const checked = announcementDraft.audienceIds.includes(option.id);
                                  return (
                                    <label
                                      key={option.id}
                                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${checked ? 'border-slate-900 bg-slate-50 text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                                    >
                                      <span className="truncate pr-3">{option.label}</span>
                                      <input type="checkbox" checked={checked} onChange={() => toggleAnnouncementAudienceId(option.id)} />
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">Announcement Preview</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {announcementDraft.scheduledFor ? `Scheduled for ${formatDate(announcementDraft.scheduledFor)}` : 'No schedule selected. Saving will publish immediately.'}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <StatusBadge value={announcementDraft.scheduledFor ? 'scheduled' : 'published'} />
                            {announcementDraft.pinned ? <Badge variant="outline">Pinned</Badge> : null}
                            {announcementDraft.pushEnabled ? <Badge variant="outline">Push enabled</Badge> : null}
                          </div>
                        </div>
                        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-4">
                          <p className="text-base font-semibold text-slate-900">{announcementDraft.title.trim() || 'Announcement title preview'}</p>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                            {announcementDraft.content.trim() || 'Announcement content preview will appear here as you write.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => void saveAnnouncement()}>
                          {selectedAnnouncement ? 'Save announcement' : 'Create announcement'}
                        </Button>
                        {selectedAnnouncement ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedAnnouncement(null);
                              setSelectedAnnouncementDetail(null);
                              resetAnnouncementDraft();
                            }}
                          >
                            Cancel editing
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </ShellCard>
                </div>
                <div className="space-y-4">
                  <ShellCard title="Announcement Queue">
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <select
                          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                          value={announcementFilters.status}
                          onChange={(event) => setAnnouncementFilters((current) => ({ ...current, status: event.target.value }))}
                        >
                          <option value="all">All statuses</option>
                          <option value="draft">Draft</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="published">Published</option>
                        </select>
                        <select
                          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                          value={announcementFilters.pinned}
                          onChange={(event) => setAnnouncementFilters((current) => ({ ...current, pinned: event.target.value }))}
                        >
                          <option value="all">All pin states</option>
                          <option value="true">Pinned</option>
                          <option value="false">Not pinned</option>
                        </select>
                        <select
                          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                          value={announcementFilters.pushEnabled}
                          onChange={(event) => setAnnouncementFilters((current) => ({ ...current, pushEnabled: event.target.value }))}
                        >
                          <option value="all">All push states</option>
                          <option value="true">Push enabled</option>
                          <option value="false">Push disabled</option>
                        </select>
                      </div>
                      {announcements.length === 0 ? (
                        <EmptyPanel title="No announcements yet" body="Published, scheduled, and draft announcements will appear here." />
                      ) : (
                        <div className="space-y-3">
                          {announcements.map((item) => (
                            <div key={item.id} className="rounded-xl border border-slate-200 px-4 py-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                                <StatusBadge value={item.status} />
                                {item.pinned ? <Badge variant="outline">Pinned</Badge> : null}
                                {item.pushEnabled ? <Badge variant="outline">Push</Badge> : null}
                              </div>
                              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.content}</p>
                              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                                <span>{item.audienceType.replaceAll('_', ' ')}</span>
                                <span>{formatNumber(item.recipientCount)} recipients</span>
                                <span>{item.scheduledFor ? `Scheduled ${formatDate(item.scheduledFor)}` : `Created ${formatDate(item.createdAt)}`}</span>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => void openAnnouncementDrawer(item)}>
                                Edit
                              </Button>
                              {item.status !== 'published' ? (
                                <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(item.id, 'publish_now')}>
                                  Publish now
                                </Button>
                              ) : null}
                              {item.status === 'published' ? (
                                <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(item.id, 'unpublish')}>
                                  Unpublish
                                </Button>
                              ) : null}
                              {item.status === 'scheduled' ? (
                                <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(item.id, 'cancel_schedule')}>
                                  Cancel schedule
                                </Button>
                              ) : null}
                              <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(item.id, 'delete')}>
                                Delete
                              </Button>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-slate-500">{item.audienceType} · {formatDate(item.scheduledFor || item.createdAt)}</p>
                        </div>
                      ))}
                        </div>
                      )}
                    </div>
                  </ShellCard>
                </div>
              </div>
            ) : null}

            {!pageLoading && page === 'logs' ? (
              <ShellCard
                title="System Logs"
                action={(
                  <Button variant="outline" size="sm" onClick={() => void exportLogsCsv()}>
                    Export CSV
                  </Button>
                )}
              >
                <div className="space-y-4">
                  <div className="grid gap-3 lg:grid-cols-3">
                    <select
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                      value={logFilters.severity}
                      onChange={(event) => setLogFilters((current) => ({ ...current, severity: event.target.value as LogFilterState['severity'], page: 1 }))}
                    >
                      <option value="">All severities</option>
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="critical">Critical</option>
                    </select>
                    <Input
                      placeholder="Filter by action type"
                      value={logFilters.actionType}
                      onChange={(event) => setLogFilters((current) => ({ ...current, actionType: event.target.value, page: 1 }))}
                    />
                    <Input
                      placeholder="Filter by actor"
                      value={logFilters.actor}
                      onChange={(event) => setLogFilters((current) => ({ ...current, actor: event.target.value, page: 1 }))}
                    />
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <select
                      className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                      value={logFilters.targetType}
                      onChange={(event) => setLogFilters((current) => ({ ...current, targetType: event.target.value, page: 1 }))}
                    >
                      <option value="">All target types</option>
                      <option value="user">User</option>
                      <option value="club">Club</option>
                      <option value="post">Post</option>
                      <option value="report">Report</option>
                      <option value="announcement">Announcement</option>
                      <option value="comment">Comment</option>
                    </select>
                    <Input
                      type="date"
                      value={logFilters.from}
                      onChange={(event) => setLogFilters((current) => ({ ...current, from: event.target.value, page: 1 }))}
                    />
                    <Input
                      type="date"
                      value={logFilters.to}
                      onChange={(event) => setLogFilters((current) => ({ ...current, to: event.target.value, page: 1 }))}
                    />
                  </div>

                  {logs.length === 0 ? (
                    <EmptyPanel title="No logs found" body="Adjust the filters or search to inspect audit activity." />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                              <th className="px-3 py-3 whitespace-nowrap">Timestamp</th>
                              <th className="px-3 py-3 whitespace-nowrap">Severity</th>
                              <th className="px-3 py-3 whitespace-nowrap">Actor</th>
                              <th className="px-3 py-3 whitespace-nowrap">Action</th>
                              <th className="px-3 py-3 whitespace-nowrap">Target</th>
                              <th className="px-3 py-3 whitespace-nowrap">Summary</th>
                              <th className="px-3 py-3 whitespace-nowrap">Open</th>
                            </tr>
                          </thead>
                          <tbody>
                            {logs.map((log) => (
                              <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-3 py-3 text-slate-500">{formatDate(log.createdAt)}</td>
                                <td className="px-3 py-3"><StatusBadge value={log.severity} /></td>
                                <td className="px-3 py-3 text-slate-700">{log.actor}</td>
                                <td className="px-3 py-3 text-slate-600">{log.actionType}</td>
                                <td className="px-3 py-3 text-slate-600">{log.targetType ?? 'system'}</td>
                                <td className="px-3 py-3 text-slate-600">{log.summary}</td>
                                <td className="px-3 py-3">
                                  <Button variant="outline" size="sm" onClick={() => void openLogDrawer(log)}>
                                    Open
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                          <span>Rows per page</span>
                          <select
                            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
                            value={logFilters.limit}
                            onChange={(event) => setLogFilters((current) => ({ ...current, limit: Number(event.target.value), page: 1 }))}
                          >
                            {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!logsPageInfo?.hasPreviousPage}
                            onClick={() => setLogFilters((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
                          >
                            Previous
                          </Button>
                          <span className="text-sm text-slate-500">
                            Page {logsPageInfo?.page ?? 1} of {logsPageInfo?.totalPages ?? 1}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!logsPageInfo?.hasNextPage}
                            onClick={() => setLogFilters((current) => ({ ...current, page: current.page + 1 }))}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ShellCard>
            ) : null}

            {!pageLoading && page === 'settings' ? (
              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <ShellCard title="Password Change">
                  <div className="space-y-4">
                    {admin?.mustChangePassword ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        The seeded admin password is still active. Change it now to complete setup.
                      </div>
                    ) : null}
                    <Input type="password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))} />
                    <Input type="password" placeholder="New password" value={passwordForm.newPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))} />
                    <Input type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
                    {passwordState.error ? <p className="text-sm text-red-600">{passwordState.error}</p> : null}
                    {passwordState.message ? <p className="text-sm text-emerald-600">{passwordState.message}</p> : null}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-sm text-slate-600">Update the current admin password for this account.</p>
                      <div className="mt-4 flex justify-start">
                        <Button
                          size="lg"
                          variant="outline"
                          className="shrink-0 rounded-md border-slate-300 bg-white px-6 text-slate-900 shadow-sm transition-all duration-150 hover:scale-[1.02] hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 hover:shadow-md active:scale-[0.99]"
                          onClick={() => void handlePasswordChange()}
                          disabled={passwordState.isSaving}
                        >
                          {passwordState.isSaving ? 'Saving...' : 'Change password'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </ShellCard>
                <ShellCard title="Operational Settings">
                  {settingsDraft ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-sm text-slate-600">Changes here update the persistent admin configuration used by the backend.</p>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={resetSettingsDraft} disabled={settingsSaving}>
                            Reset unsaved changes
                          </Button>
                          <Button
                            variant="outline"
                            className="border-slate-300 bg-white text-slate-900 shadow-sm transition-all duration-150 hover:scale-[1.02] hover:border-slate-400 hover:bg-slate-100 hover:text-slate-900 hover:shadow-md active:scale-[0.99]"
                            onClick={() => void handleSaveSettings()}
                            disabled={settingsSaving}
                          >
                            {settingsSaving ? 'Saving...' : 'Save changes'}
                          </Button>
                        </div>
                      </div>
                      {Object.entries(settingsDraft).map(([section, values]) => (
                        <div key={section} className="rounded-lg border border-slate-200 p-4">
                          <p className="text-sm font-semibold text-slate-900">{SETTINGS_SECTION_LABELS[section as keyof AdminSettingsResponse] ?? humanizeSettingKey(section)}</p>
                          <div className="mt-3 space-y-2">
                            {Object.entries(values as Record<string, unknown>).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-3 text-sm">
                                <span className="text-slate-600">{humanizeSettingKey(key)}</span>
                                {typeof value === 'boolean' ? (
                                  <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={value}
                                      onChange={(event) => setSettingsDraft((current) => {
                                        if (!current) return current;
                                        return {
                                          ...current,
                                          [section]: {
                                            ...current[section as keyof AdminSettingsResponse],
                                            [key]: event.target.checked,
                                          },
                                        };
                                      })}
                                    />
                                    {value ? 'Enabled' : 'Disabled'}
                                  </label>
                                ) : (
                                  <Input
                                    type="number"
                                    min={1}
                                    className="max-w-32"
                                    value={String(value)}
                                    onChange={(event) => setSettingsDraft((current) => {
                                      if (!current) return current;
                                      return {
                                        ...current,
                                        [section]: {
                                          ...current[section as keyof AdminSettingsResponse],
                                          [key]: Math.max(1, Number(event.target.value) || 1),
                                        },
                                      };
                                    })}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyPanel title="No settings available" body="Settings will appear here once the configuration record loads." />
                  )}
                </ShellCard>
              </div>
            ) : null}
            </div>
          </main>
        </div>

      <Toaster richColors position="top-right" />

      <RightDrawer
        open={Boolean(selectedUser)}
        title={selectedUserDetail?.username ?? selectedUser?.username ?? 'User detail'}
        subtitle={selectedUserDetail?.email ?? selectedUser?.email}
        onClose={() => {
          setSelectedUser(null);
          setUserActionForm({ note: '', durationDays: 7 });
        }}
      >
        {selectedUserDetailQuery.isError ? (
          <EmptyPanel title="Unable to load user details" body={selectedUserDetailQuery.error instanceof Error ? selectedUserDetailQuery.error.message : 'Try opening this user again.'} />
        ) : userDetailLoading ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="rounded-2xl border border-slate-200 px-5 py-4">
                  <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                  <div className="mt-4 h-8 w-24 animate-pulse rounded-full bg-slate-100" />
                </div>
              ))}
            </div>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="h-5 w-40 animate-pulse rounded bg-slate-200" />
              </div>
              <div className="space-y-4 px-5 py-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="rounded-2xl border border-slate-200 px-4 py-4">
                      <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                      <div className="mt-3 h-4 w-28 animate-pulse rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <div className="h-3 w-14 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-16 animate-pulse rounded-xl bg-slate-100" />
                </div>
              </div>
            </section>
          </div>
        ) : selectedUserDetail ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                <div className="mt-2"><StatusBadge value={selectedUserDetail.status} /></div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Verified</p>
                <div className="mt-2"><StatusBadge value={selectedUserDetail.verified ? 'verified' : 'unverified'} /></div>
              </div>
            </div>

            <ShellCard title="Profile Overview">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">College</p>
                  <p className="mt-2 text-sm text-slate-800">{selectedUserDetail.college}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Department</p>
                  <p className="mt-2 text-sm text-slate-800">{selectedUserDetail.department || 'Unknown'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Created</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedUserDetail.createdAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Last seen</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedUserDetail.lastSeenAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Suspended until</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedUserDetail.suspendedUntil)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Headline</p>
                  <p className="mt-2 text-sm text-slate-800">{selectedUserDetail.headline || 'No headline set'}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Bio</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{selectedUserDetail.bio || 'No bio available.'}</p>
              </div>
            </ShellCard>

            <ShellCard title="Moderation Actions">
              <div className="space-y-3">
                <Textarea
                  rows={4}
                  placeholder="Add an internal moderation note"
                  value={userActionForm.note}
                  onChange={(event) => setUserActionForm((current) => ({ ...current, note: event.target.value }))}
                />
                <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={userActionForm.durationDays}
                    onChange={(event) => setUserActionForm((current) => ({ ...current, durationDays: Number(event.target.value) || 7 }))}
                    placeholder="Suspension days"
                  />
                  <div className="flex flex-wrap gap-2">
                    {getUserActionOptions({ status: selectedUserDetail.status, verified: selectedUserDetail.verified }).map((option) => (
                      <Button
                        key={option.action}
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void runUserAction(selectedUserDetail.id, option.action, {
                            note: userActionForm.note.trim() || undefined,
                            durationDays: option.action === 'suspend' ? userActionForm.durationDays : undefined,
                          })
                        }
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Recent Posts">
              <div className="space-y-3">
                {(selectedUserDetail.recentPosts ?? []).length === 0 ? <EmptyPanel title="No recent posts" body="Recent authored posts will appear here." /> : (selectedUserDetail.recentPosts ?? []).map((post: any) => (
                  <div key={post.id} className="rounded-xl border border-slate-200 px-4 py-4">
                    <p className="text-sm font-medium text-slate-800">{post.title || 'Untitled post'}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{post.preview || 'No preview available.'}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <StatusBadge value={post.status} />
                      <p className="text-xs text-slate-500">{formatDate(post.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Clubs Joined">
              <div className="space-y-3">
                {(selectedUserDetail.clubs ?? []).length === 0 ? <EmptyPanel title="No clubs joined" body="Club memberships will appear here." /> : (selectedUserDetail.clubs ?? []).map((club: any) => (
                  <div key={club.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <span className="text-sm text-slate-700">{club.name}</span>
                    <div className="flex gap-2">
                      <StatusBadge value={club.role} />
                      <StatusBadge value={club.status} />
                    </div>
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Reports">
              <div className="space-y-3">
                {(selectedUserDetail.reports ?? []).length === 0 ? <EmptyPanel title="No reports" body="Reports targeting this user will appear here." /> : (selectedUserDetail.reports ?? []).map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <div>
                      <span className="text-sm text-slate-700">{report.reason}</span>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(report.createdAt)}</p>
                    </div>
                    <StatusBadge value={report.status} />
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Moderation History">
              <div className="space-y-3">
                {(selectedUserDetail.moderationHistory ?? []).length === 0 ? <EmptyPanel title="No moderation history" body="Admin actions on this user will appear here." /> : (selectedUserDetail.moderationHistory ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{entry.summary}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.1em] text-slate-500">{entry.actor} · {entry.actionType}</p>
                      </div>
                      <StatusBadge value={entry.severity} />
                    </div>
                    {'note' in (entry.metadata ?? {}) ? <p className="mt-3 text-sm leading-6 text-slate-600">{String(entry.metadata?.note ?? '')}</p> : null}
                    {'durationDays' in (entry.metadata ?? {}) ? <p className="mt-3 text-xs text-slate-500">Suspension length: {String(entry.metadata?.durationDays)} days</p> : null}
                    <p className="mt-3 text-xs text-slate-500">{formatDate(entry.timestamp)}</p>
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Login History">
              <div className="space-y-3">
                {(selectedUserDetail.loginHistory ?? []).length === 0 ? <EmptyPanel title="No login history" body="Recent user sessions will appear here." /> : (selectedUserDetail.loginHistory ?? []).map((entry: any) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 px-4 py-4">
                    <p className="text-sm font-medium text-slate-800">{entry.browser} · {entry.platform}</p>
                    <p className="mt-2 text-sm text-slate-500">{entry.location}</p>
                    <p className="mt-3 text-xs text-slate-500">{formatDate(entry.lastSeenAt || entry.createdAt)}</p>
                  </div>
                ))}
              </div>
            </ShellCard>
          </div>
        ) : null}
      </RightDrawer>

      <RightDrawer
        open={Boolean(selectedClub)}
        title={selectedClubDetail?.name ?? selectedClub?.name ?? 'Club detail'}
        subtitle={selectedClubDetail?.description ?? 'Club moderation and analytics'}
        onClose={() => {
          setSelectedClub(null);
          setSelectedClubDetail(null);
          setClubMembers([]);
          setTransferTarget('');
          setTransferConfirm(false);
        }}
      >
        {clubDetailLoading ? (
          <DrawerSkeleton showFooterBlocks={4} />
        ) : selectedClubDetail ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                <div className="mt-2"><StatusBadge value={selectedClubDetail.status} /></div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Verified</p>
                <div className="mt-2"><StatusBadge value={selectedClubDetail.verified ? 'verified' : 'unverified'} /></div>
              </div>
            </div>

            <ShellCard title="Owner">
              {selectedClubDetail.owner ? (
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                    {selectedClubDetail.owner.username.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{selectedClubDetail.owner.username}</p>
                    <p className="text-xs text-slate-500">{selectedClubDetail.owner.email}</p>
                  </div>
                </div>
              ) : <EmptyPanel title="No owner found" body="Owner data is unavailable." />}
            </ShellCard>

            <ShellCard title="Member Snapshot">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Total members</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(selectedClubDetail.memberSnapshot.totalMembers)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Admins</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(selectedClubDetail.memberSnapshot.adminCount)}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="30-Day Analytics">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Member growth</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(selectedClubDetail.analytics.memberGrowth30d)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Engagement</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(selectedClubDetail.analytics.engagement30d)}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Linked Reports">
              <div className="space-y-3">
                {(selectedClubDetail.linkedReports ?? []).length === 0 ? <EmptyPanel title="No reports" body="No reports targeting this club." /> : (selectedClubDetail.linkedReports ?? []).map((report) => (
                  <div key={report.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                    <div>
                      <span className="text-sm text-slate-700">{report.reason}</span>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(report.createdAt)}</p>
                    </div>
                    <div className="flex gap-2">
                      <StatusBadge value={report.severity} />
                      <StatusBadge value={report.status} />
                    </div>
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Top Posts">
              <div className="space-y-3">
                {(selectedClubDetail.topPosts ?? []).length === 0 ? <EmptyPanel title="No posts" body="No posts found for this club." /> : (selectedClubDetail.topPosts ?? []).map((post) => (
                  <div key={post.id} className="rounded-md border border-slate-200 px-3 py-3">
                    <p className="text-sm font-medium text-slate-800">{post.title || 'Untitled post'}</p>
                    <p className="mt-1 text-sm text-slate-500">{post.preview || 'No preview available.'}</p>
                    <p className="mt-2 text-xs text-slate-500">{post.likes} likes · {formatDate(post.createdAt)}</p>
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Moderation History">
              <div className="space-y-3">
                {(selectedClubDetail.moderationHistory ?? []).length === 0 ? <EmptyPanel title="No moderation history" body="Admin actions on this club will appear here." /> : (selectedClubDetail.moderationHistory ?? []).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{entry.summary}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.1em] text-slate-500">{entry.actor} · {entry.actionType}</p>
                      </div>
                      <StatusBadge value={entry.severity} />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">{formatDate(entry.timestamp)}</p>
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Transfer Ownership">
              <div className="space-y-3">
                <p className="text-sm text-slate-600">Transfer club ownership to another active member. The current owner will be demoted to admin.</p>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search members..."
                    className="h-10"
                    onChange={(event) => {
                      if (selectedClub) void loadClubMembers(selectedClub.id, event.target.value);
                    }}
                    onFocus={() => {
                      if (selectedClub && clubMembers.length === 0) void loadClubMembers(selectedClub.id);
                    }}
                  />
                </div>
                {clubMembers.length > 0 ? (
                  <select
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
                    value={transferTarget}
                    onChange={(event) => { setTransferTarget(event.target.value); setTransferConfirm(false); }}
                  >
                    <option value="">Select a member...</option>
                    {clubMembers.filter((m) => m.role !== 'owner').map((member) => (
                      <option key={member.id} value={member.id}>{member.username} ({member.role}) — {member.email}</option>
                    ))}
                  </select>
                ) : null}
                {transferTarget ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={transferConfirm} onChange={(event) => setTransferConfirm(event.target.checked)} />
                      I confirm I want to transfer ownership to {clubMembers.find((m) => m.id === transferTarget)?.username ?? 'this user'}
                    </label>
                  </div>
                ) : null}
                <Button
                  className="bg-slate-900 text-white hover:bg-slate-800"
                  disabled={!transferTarget || !transferConfirm}
                  onClick={async () => {
                    if (!selectedClub || !transferTarget) return;
                    await runClubAction(selectedClub.id, 'transfer_ownership', { targetUserId: transferTarget });
                    setTransferTarget('');
                    setTransferConfirm(false);
                    if (token) {
                      setSelectedClubDetail(await apiAdminGet<AdminClubDetailResponse>(`/admin/clubs/${selectedClub.id}`, token));
                    }
                  }}
                >
                  Transfer ownership
                </Button>
              </div>
            </ShellCard>
          </div>
        ) : null}
      </RightDrawer>

      <RightDrawer
        open={Boolean(selectedReport)}
        title={selectedReportDetail?.reason ?? selectedReport?.reason ?? 'Report detail'}
        subtitle={selectedReportDetail ? `${getReportTargetKindLabel(selectedReportDetail.targetType)} · ${selectedReportDetail.targetPreview.label}` : 'Moderation ticket workflow'}
        onClose={() => {
          setSelectedReport(null);
          setSelectedReportDetail(null);
          setReportInternalNotes('');
          setReportNoteDraft('');
        }}
      >
        {reportDetailLoading ? (
          <DrawerSkeleton showFooterBlocks={4} />
        ) : selectedReportDetail ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge value={selectedReportDetail.status} />
                  <StatusBadge value={selectedReportDetail.severity} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Frequency</p>
                <p className="mt-2 text-sm text-slate-800">{formatNumber(selectedReportDetail.reportFrequency)} reports</p>
              </div>
            </div>

            <ShellCard title="Ticket Overview">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Created</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedReportDetail.createdAt)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Resolved</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedReportDetail.resolvedAt)}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Reporter and Assignee">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Reporter</p>
                  {selectedReportDetail.reporter ? (
                    <>
                      <p className="mt-2 text-sm font-medium text-slate-800">{selectedReportDetail.reporter.username}</p>
                      <p className="mt-1 text-xs text-slate-500">{selectedReportDetail.reporter.email}</p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">System generated</p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Assignee</p>
                  {selectedReportDetail.assignee ? (
                    <>
                      <p className="mt-2 text-sm font-medium text-slate-800">{selectedReportDetail.assignee.username}</p>
                      <p className="mt-1 text-xs text-slate-500">{selectedReportDetail.assignee.email}</p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">Unassigned</p>
                  )}
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Evidence and Reason">
              <div className="space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Reason</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selectedReportDetail.reason}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Evidence</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{selectedReportDetail.evidence || 'No extra evidence attached.'}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Target Preview">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{getReportTargetKindLabel(selectedReportDetail.targetType)}</Badge>
                  <StatusBadge value={selectedReportDetail.targetPreview.status ?? 'active'} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{selectedReportDetail.targetPreview.label}</p>
                  {'preview' in selectedReportDetail.targetPreview && selectedReportDetail.targetPreview.preview ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">{selectedReportDetail.targetPreview.preview}</p>
                  ) : null}
                  {'email' in selectedReportDetail.targetPreview && selectedReportDetail.targetPreview.email ? (
                    <p className="mt-2 text-xs text-slate-500">{selectedReportDetail.targetPreview.email}</p>
                  ) : null}
                </div>
                <Button variant="outline" size="sm" onClick={() => void openReportTarget(selectedReportDetail)}>Open linked target</Button>
              </div>
            </ShellCard>

            <ShellCard title="Moderation Actions">
              <div className="flex flex-wrap gap-2">
                {getReportActionOptions(selectedReportDetail).map((action) => (
                  <Button
                    key={`${action.type}-${action.label}`}
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void runReportAction(
                        selectedReportDetail.id,
                        action.body,
                        action.type === 'assignment'
                          ? 'Report unassigned'
                          : action.body.status === 'reviewing'
                            ? 'Report assigned and moved to review'
                            : `Report ${action.body.status}`,
                      )
                    }
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Internal Notes">
              <div className="space-y-3">
                <Textarea rows={5} value={reportInternalNotes} onChange={(event) => setReportInternalNotes(event.target.value)} placeholder="Persistent case notes for this report" />
                <Button variant="outline" size="sm" onClick={() => void saveReportInternalNotes()}>Save internal notes</Button>
              </div>
            </ShellCard>

            <ShellCard title="Add Note">
              <div className="space-y-3">
                <Textarea rows={4} value={reportNoteDraft} onChange={(event) => setReportNoteDraft(event.target.value)} placeholder="Add a timeline note for this report" />
                <Button variant="outline" size="sm" onClick={() => void addReportNote()}>Add note</Button>
              </div>
            </ShellCard>

            <ShellCard title="Timeline">
              <div className="space-y-3">
                {reportTimeline.length === 0 ? (
                  <EmptyPanel title="No timeline activity" body="Notes and report actions will appear here." />
                ) : (
                  reportTimeline.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{item.summary}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.1em] text-slate-500">{item.actor.username} Â· {item.type}</p>
                        </div>
                        <StatusBadge value={item.severity} />
                      </div>
                      {item.body ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.body}</p> : null}
                      <p className="mt-3 text-xs text-slate-500">{formatDate(item.timestamp)}</p>
                    </div>
                  ))
                )}
              </div>
            </ShellCard>
          </div>
        ) : null}
      </RightDrawer>

      <RightDrawer
        open={Boolean(selectedAnnouncement)}
        title={selectedAnnouncementDetail?.title ?? selectedAnnouncement?.title ?? 'Announcement detail'}
        subtitle={selectedAnnouncementDetail?.status ? `Lifecycle: ${selectedAnnouncementDetail.status}` : 'Announcement lifecycle and delivery details'}
        onClose={() => {
          setSelectedAnnouncement(null);
          setSelectedAnnouncementDetail(null);
          resetAnnouncementDraft();
        }}
      >
        {selectedAnnouncementDetail ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                <div className="mt-2"><StatusBadge value={selectedAnnouncementDetail.status} /></div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Intended recipients</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(announcementRecipientPreview)}</p>
              </div>
            </div>

            <ShellCard title="Lifecycle">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Created by</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{selectedAnnouncementDetail.createdBy.username}</p>
                  <p className="mt-1 text-xs text-slate-500">{selectedAnnouncementDetail.createdBy.email}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Push delivery</p>
                  <div className="mt-2">
                    <StatusBadge value={selectedAnnouncementDetail.pushEnabled ? 'enabled' : 'disabled'} />
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Created</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedAnnouncementDetail.createdAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Updated</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedAnnouncementDetail.updatedAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Published</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedAnnouncementDetail.publishedAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Scheduled</p>
                  <p className="mt-2 text-sm text-slate-800">{formatDate(selectedAnnouncementDetail.scheduledFor)}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Audience">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge value={selectedAnnouncementDetail.audienceType} />
                  {selectedAnnouncementDetail.pinned ? <Badge variant="outline">Pinned</Badge> : null}
                  {selectedAnnouncementDetail.pushEnabled ? <Badge variant="outline">Push enabled</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedAnnouncementDetail.audienceType === 'all_users' ? (
                    <Badge variant="outline">All users</Badge>
                  ) : selectedAnnouncementDetail.audienceIds.length === 0 ? (
                    <p className="text-sm text-slate-500">No specific audience IDs are selected.</p>
                  ) : (
                    selectedAnnouncementDetail.audienceIds.map((audienceId) => {
                      const label = [...announcementOptions.clubs, ...announcementOptions.branches].find((option) => option.id === audienceId)?.label ?? audienceId;
                      return <Badge key={audienceId} variant="outline">{label}</Badge>;
                    })
                  )}
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Message">
              <div className="space-y-3">
                <p className="text-base font-semibold text-slate-900">{selectedAnnouncementDetail.title}</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedAnnouncementDetail.content}</p>
              </div>
            </ShellCard>

            <ShellCard title="Actions">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void saveAnnouncement()}>
                  Save current edits
                </Button>
                {selectedAnnouncementDetail.status !== 'published' ? (
                  <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(selectedAnnouncementDetail.id, 'publish_now')}>
                    Publish now
                  </Button>
                ) : null}
                {selectedAnnouncementDetail.status === 'published' ? (
                  <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(selectedAnnouncementDetail.id, 'unpublish')}>
                    Unpublish
                  </Button>
                ) : null}
                {selectedAnnouncementDetail.status === 'scheduled' ? (
                  <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(selectedAnnouncementDetail.id, 'cancel_schedule')}>
                    Cancel schedule
                  </Button>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => void runAnnouncementAction(selectedAnnouncementDetail.id, 'delete')}>
                  Delete
                </Button>
              </div>
            </ShellCard>
          </div>
        ) : null}
      </RightDrawer>

      <RightDrawer
        open={Boolean(selectedLog)}
        title={selectedLogDetail?.summary ?? selectedLog?.summary ?? 'Log detail'}
        subtitle={selectedLogDetail?.actionType ?? selectedLog?.actionType ?? 'Audit event details'}
        onClose={() => {
          setSelectedLog(null);
          setSelectedLogDetail(null);
        }}
      >
        {logDetailLoading ? (
          <DrawerSkeleton showFooterBlocks={3} />
        ) : selectedLogDetail ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Severity</p>
                <div className="mt-2"><StatusBadge value={selectedLogDetail.severity} /></div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Timestamp</p>
                <p className="mt-2 text-sm text-slate-800">{formatDate(selectedLogDetail.createdAt)}</p>
              </div>
            </div>

            <ShellCard title="Event Overview">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Action type</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{selectedLogDetail.actionType}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Target type</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{selectedLogDetail.targetType ?? 'system'}</p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Summary</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{selectedLogDetail.summary}</p>
              </div>
            </ShellCard>

            <ShellCard title="Actor">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                  {selectedLogDetail.actor.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{selectedLogDetail.actor.username}</p>
                  <p className="text-xs text-slate-500">{selectedLogDetail.actor.email}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Target Reference">
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Label</p>
                  <p className="mt-2 text-sm text-slate-800">{selectedLogDetail.targetLabel ?? 'No target label available'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Target ID</p>
                  <p className="mt-2 break-all text-sm text-slate-800">{selectedLogDetail.targetId ?? 'No target id'}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Metadata">
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-4">
                <pre className="text-xs leading-6 text-slate-100">{JSON.stringify(selectedLogDetail.metadata ?? {}, null, 2)}</pre>
              </div>
            </ShellCard>
          </div>
        ) : null}
      </RightDrawer>

      <RightDrawer
        open={Boolean(selectedPost)}
        title={selectedPostDetail?.title ?? selectedPost?.title ?? 'Post detail'}
        subtitle={`Review post moderation details${selectedPostDetail?.club?.name ? ` · ${selectedPostDetail.club.name}` : ''}`}
        onClose={() => {
          setSelectedPost(null);
          setSelectedPostDetail(null);
          setSelectedPostComments([]);
          setSelectedPostCommentsNextCursor(null);
          setExpandedCommentIds({});
          setCommentRepliesByParentId({});
          setCommentRepliesNextCursorByParentId({});
          setCommentRepliesLoadingByParentId({});
          setPostActionNote('');
          setCommentActionNote('');
        }}
      >
        {postDetailLoading ? (
          <DrawerSkeleton showComments showFooterBlocks={2} />
        ) : selectedPostDetail ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                <div className="mt-2"><StatusBadge value={selectedPostDetail.status} /></div>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Created</p>
                <p className="mt-2 text-sm text-slate-800">{formatDate(selectedPostDetail.createdAt)}</p>
              </div>
            </div>

            <ShellCard title="Author">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
                {selectedPostDetail.author.avatarUrl ? (
                  <img
                    src={selectedPostDetail.author.avatarUrl}
                    alt={selectedPostDetail.author.username}
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white">
                    {selectedPostDetail.author.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-800">{selectedPostDetail.author.username}</p>
                  <p className="text-xs text-slate-500">{selectedPostDetail.author.email}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Post Content">
              <div className="space-y-3">
                {selectedPostDetail.club ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>Club</span>
                    <Badge variant="outline">{selectedPostDetail.club.name}</Badge>
                  </div>
                ) : null}
                <p className="text-sm leading-6 text-slate-700">{selectedPostDetail.content || 'No content available.'}</p>
                {selectedPostDetail.hiddenReason ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-amber-700">Hidden reason</p>
                    <p className="mt-2 text-sm text-amber-800">{selectedPostDetail.hiddenReason}</p>
                  </div>
                ) : null}
              </div>
            </ShellCard>

            <ShellCard title="Media">
              <div className="space-y-3">
                {selectedPostDetail.media.length === 0 ? (
                  <EmptyPanel title="No media" body="This post does not include attached media." />
                ) : (
                  selectedPostDetail.media.map((media) => (
                    <div key={media.id} className="overflow-hidden rounded-xl border border-slate-200">
                      <div className="border-b border-slate-200 px-4 py-2 text-xs uppercase tracking-[0.12em] text-slate-500">{media.type}</div>
                      {media.type.startsWith('image') ? (
                        <img src={media.url} alt="Post media" className="max-h-80 w-full object-cover" />
                      ) : (
                        <div className="p-4">
                          <a href={media.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline">
                            Open media
                          </a>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ShellCard>

            <ShellCard title="Engagement">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Likes</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(selectedPostDetail.engagement.likes)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Comments</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(selectedPostDetail.engagement.comments)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Total</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(selectedPostDetail.engagement.total)}</p>
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Moderation Actions">
              <div className="space-y-3">
                <Textarea
                  rows={4}
                  placeholder="Add a moderation note for hide, warn, or escalate"
                  value={postActionNote}
                  onChange={(event) => setPostActionNote(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {getPostActionOptions(selectedPostDetail).map((option) => (
                    <Button
                      key={option.action}
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const trimmedNote = postActionNote.trim();
                        if (['hide', 'warn', 'escalate'].includes(option.action) && !trimmedNote) {
                          toast.error('Add a moderation note before this action.');
                          return;
                        }
                        void runPostAction(selectedPostDetail.id, option.action, {
                          note: trimmedNote || undefined,
                        });
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </ShellCard>

            <ShellCard title="Linked Reports">
              <div className="space-y-3">
                {selectedPostDetail.linkedReports.length === 0 ? (
                  <EmptyPanel title="No reports" body="No moderation reports target this post yet." />
                ) : (
                  selectedPostDetail.linkedReports.map((report) => (
                    <div key={report.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
                      <div>
                        <span className="text-sm text-slate-700">{report.reason}</span>
                        <p className="mt-1 text-xs text-slate-500">{formatDate(report.createdAt)}</p>
                      </div>
                      <div className="flex gap-2">
                        <StatusBadge value={report.severity} />
                        <StatusBadge value={report.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ShellCard>

            <ShellCard title="Comments">
              <div className="space-y-3">
                <Textarea
                  rows={3}
                  placeholder="Add a moderation note for warning or suspending a comment author"
                  value={commentActionNote}
                  onChange={(event) => setCommentActionNote(event.target.value)}
                />
                {selectedPostComments.length === 0 ? (
                  <EmptyPanel title="No comments" body="This post does not have any comments yet." />
                ) : (
                  selectedPostComments.map((comment) => {
                    const renderComment = (item: AdminPostComment, depth = 0): React.ReactNode => {
                      const isExpanded = Boolean(expandedCommentIds[item.id]);
                      const replies = commentRepliesByParentId[item.id] ?? [];
                      const repliesNextCursor = commentRepliesNextCursorByParentId[item.id] ?? null;
                      const repliesLoading = Boolean(commentRepliesLoadingByParentId[item.id]);

                      return (
                        <div key={item.id} className={`rounded-xl border border-slate-200 px-4 py-4 ${depth > 0 ? 'ml-4 mt-3' : ''}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">{item.authorUsername}</p>
                              <p className="mt-1 text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{formatNumber(item.likeCount)} likes</Badge>
                              <Badge variant="outline">{formatNumber(item.replyCount)} replies</Badge>
                            </div>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-slate-700">{item.content}</p>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void runCommentAction(item.id, 'delete', selectedPostDetail.id)}
                            >
                              Delete
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const trimmedNote = commentActionNote.trim();
                                if (!trimmedNote) {
                                  toast.error('Add a moderation note before warning a comment author.');
                                  return;
                                }
                                void runCommentAction(item.id, 'warn_author', selectedPostDetail.id, { note: trimmedNote });
                              }}
                            >
                              Warn author
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void runCommentAction(item.id, 'suspend_author', selectedPostDetail.id, { note: commentActionNote.trim() || undefined })}
                            >
                              Suspend author
                            </Button>
                            {item.replyCount > 0 ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  const nextExpanded = !isExpanded;
                                  setExpandedCommentIds((current) => ({ ...current, [item.id]: nextExpanded }));
                                  if (nextExpanded && replies.length === 0 && !repliesLoading) {
                                    setCommentRepliesLoadingByParentId((current) => ({ ...current, [item.id]: true }));
                                    try {
                                      await loadAdminPostComments(selectedPostDetail.id, { parentCommentId: item.id });
                                    } finally {
                                      setCommentRepliesLoadingByParentId((current) => ({ ...current, [item.id]: false }));
                                    }
                                  }
                                }}
                              >
                                {isExpanded ? 'Hide replies' : `View replies (${formatNumber(item.replyCount)})`}
                              </Button>
                            ) : null}
                          </div>
                          {isExpanded ? (
                            <div className="mt-3 space-y-3">
                              {repliesLoading && replies.length === 0 ? (
                                <p className="text-sm text-slate-500">Loading replies...</p>
                              ) : replies.length === 0 ? (
                                <p className="text-sm text-slate-500">No replies loaded.</p>
                              ) : (
                                replies.map((reply) => renderComment(reply, depth + 1))
                              )}
                              {repliesNextCursor ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={repliesLoading}
                                  onClick={async () => {
                                    setCommentRepliesLoadingByParentId((current) => ({ ...current, [item.id]: true }));
                                    try {
                                      await loadAdminPostComments(selectedPostDetail.id, {
                                        parentCommentId: item.id,
                                        cursor: repliesNextCursor,
                                        append: true,
                                      });
                                    } finally {
                                      setCommentRepliesLoadingByParentId((current) => ({ ...current, [item.id]: false }));
                                    }
                                  }}
                                >
                                  Load more replies
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    };

                    return renderComment(comment);
                  })
                )}
                {selectedPostCommentsNextCursor ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadAdminPostComments(selectedPostDetail.id, { cursor: selectedPostCommentsNextCursor, append: true })}
                  >
                    Load more comments
                  </Button>
                ) : null}
              </div>
            </ShellCard>

            <ShellCard title="Moderation History">
              <div className="space-y-3">
                {selectedPostDetail.moderationHistory.length === 0 ? (
                  <EmptyPanel title="No moderation history" body="Admin actions on this post will appear here." />
                ) : (
                  selectedPostDetail.moderationHistory.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{entry.summary}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.1em] text-slate-500">{entry.actor} · {entry.actionType}</p>
                        </div>
                        <StatusBadge value={entry.severity} />
                      </div>
                      {'note' in (entry.metadata ?? {}) ? <p className="mt-3 text-sm leading-6 text-slate-600">{String(entry.metadata?.note ?? '')}</p> : null}
                      <p className="mt-3 text-xs text-slate-500">{formatDate(entry.timestamp)}</p>
                    </div>
                  ))
                )}
              </div>
            </ShellCard>
          </div>
        ) : null}
      </RightDrawer>
    </div>
  );
}

function DrawerSkeleton({
  showComments = false,
  showFooterBlocks = 3,
}: {
  showComments?: boolean;
  showFooterBlocks?: number;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 px-4 py-3">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-3 h-8 w-24 rounded-full" />
        </div>
        <div className="rounded-2xl border border-slate-200 px-4 py-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-4 w-32" />
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-3 w-40" />
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-200 px-4 py-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-6 w-14" />
            </div>
          ))}
        </div>
      </section>

      {showComments ? (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="space-y-3 p-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-slate-200 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-2 h-3 w-36" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-7 w-16 rounded-full" />
                    <Skeleton className="h-7 w-20 rounded-full" />
                  </div>
                </div>
                <Skeleton className="mt-3 h-14 w-full rounded-xl" />
                <div className="mt-4 flex gap-2">
                  <Skeleton className="h-9 w-20 rounded-full" />
                  <Skeleton className="h-9 w-28 rounded-full" />
                  <Skeleton className="h-9 w-32 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {Array.from({ length: showFooterBlocks }).map((_, index) => (
        <section key={index} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="space-y-3 p-4">
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        </section>
      ))}
    </div>
  );
}
