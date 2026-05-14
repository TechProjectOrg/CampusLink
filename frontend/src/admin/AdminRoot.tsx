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
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { apiChangePassword, apiVerifyPasswordChange } from '../lib/authApi';
import {
  apiAdminGet,
  apiAdminPost,
  type AdminDashboardRange,
  type AdminDashboardResponse,
  type AdminDashboardTrendDirection,
  type AdminProfile,
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

const SEARCHABLE_PAGES = new Set<PageKey>(['users', 'clubs', 'posts', 'logs']);
const ADMIN_CACHE_MS = 30_000;
const DASHBOARD_RANGES: AdminDashboardRange[] = ['7d', '30d', '90d'];

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

async function fetchAdminPageData(page: PageKey, token: string, search: string, range: AdminDashboardRange, userFilters: UserFilterState, clubFilters: ClubFilterState = DEFAULT_CLUB_FILTERS) {
  if (page === 'dashboard') return apiAdminGet<AdminDashboardResponse>(`/admin/dashboard?range=${encodeURIComponent(range)}`, token);
  if (page === 'users') return apiAdminGet<AdminUserListResponse>(`/admin/users?${buildUsersQueryString(search, userFilters)}`, token);
  if (page === 'clubs') return apiAdminGet<AdminClubListResponse>(`/admin/clubs?${buildClubsQueryString(search, clubFilters)}`, token);
  if (page === 'posts') return apiAdminGet(`/admin/posts?q=${encodeURIComponent(search)}`, token);
  if (page === 'reports') return apiAdminGet('/admin/reports', token);
  if (page === 'verification') return apiAdminGet('/admin/verification-requests', token);
  if (page === 'analytics') return apiAdminGet('/admin/analytics', token);
  if (page === 'announcements') return apiAdminGet('/admin/announcements', token);
  if (page === 'logs') return apiAdminGet(`/admin/logs?q=${encodeURIComponent(search)}`, token);
  return apiAdminGet('/admin/settings', token);
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
  const [transferTarget, setTransferTarget] = useState<string>('');
  const [transferConfirm, setTransferConfirm] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userActionForm, setUserActionForm] = useState({ note: '', durationDays: 7 });

  const [announcementDraft, setAnnouncementDraft] = useState({
    title: '',
    content: '',
    audienceType: 'all_users',
    audienceIds: '',
    scheduledFor: '',
    pinned: false,
    pushEnabled: false,
  });

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordState, setPasswordState] = useState({ isSaving: false, message: '', error: '' });

  const pageTitle = useMemo(() => NAV_ITEMS.find((item) => item.key === page)?.label ?? 'Dashboard', [page]);
  const searchKey = useMemo(() => getSearchKey(page, search), [page, search]);
  const usersQueryContext = useMemo(() => (page === 'users' ? JSON.stringify(userFilters) : ''), [page, userFilters]);
  const clubsQueryContext = useMemo(() => (page === 'clubs' ? JSON.stringify(clubFilters) : ''), [page, clubFilters]);

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
    if (page !== 'users') return;
    setSelectedUserIds([]);
  }, [page, searchKey, userFilters]);

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
    queryKey: token ? getAdminQueryKey(token, page, searchKey, dashboardRange, usersQueryContext + clubsQueryContext) : ['admin', page, searchKey, 'anon', dashboardRange, usersQueryContext + clubsQueryContext],
    queryFn: () => fetchAdminPageData(page, token!, searchKey, dashboardRange, userFilters, clubFilters),
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
  const posts = page === 'posts' ? ((currentPageQuery.data as any[]) ?? []) : [];
  const reports = page === 'reports' ? ((currentPageQuery.data as any[]) ?? []) : [];
  const verification = page === 'verification' ? ((currentPageQuery.data as any[]) ?? []) : [];
  const analytics = page === 'analytics' ? (currentPageQuery.data ?? null) : null;
  const announcements = page === 'announcements' ? ((currentPageQuery.data as any[]) ?? []) : [];
  const logs = page === 'logs' ? ((currentPageQuery.data as any[]) ?? []) : [];
  const settings = page === 'settings' ? (currentPageQuery.data ?? null) : null;
  const activeQuery = page === 'dashboard' ? dashboardQuery : currentPageQuery;
  const pageLoading = activeQuery.isLoading;
  const pageRefreshing = activeQuery.isFetching && !activeQuery.isLoading;
  const selectedUserDetailQuery = useQuery({
    queryKey: selectedUser && token ? getAdminUserDetailQueryKey(token, selectedUser.id) : ['admin', 'user-detail', 'idle'],
    queryFn: () => apiAdminGet<AdminUserDetailResponse>(`/admin/users/${selectedUser!.id}`, token!),
    enabled: Boolean(token && selectedUser),
    staleTime: ADMIN_CACHE_MS,
    gcTime: ADMIN_CACHE_MS * 10,
  });
  const selectedUserDetail = selectedUserDetailQuery.data ?? null;
  const userDetailLoading = selectedUserDetailQuery.isLoading || (selectedUserDetailQuery.isFetching && !selectedUserDetail);

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
    void queryClient.prefetchQuery({
      queryKey: getAdminQueryKey(token, nextPage, nextSearchKey, dashboardRange, nextPage === 'users' ? JSON.stringify(userFilters) : ''),
      queryFn: () => fetchAdminPageData(nextPage, token, nextSearchKey, dashboardRange, userFilters),
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
    await queryClient.invalidateQueries({ queryKey: getAdminQueryKey(token, page, searchKey, dashboardRange, usersQueryContext + clubsQueryContext), exact: true });
    if (page !== 'dashboard') {
      await queryClient.invalidateQueries({ queryKey: getAdminQueryKey(token, 'dashboard', '', dashboardRange), exact: true });
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

  const runPostAction = async (postId: string, action: string) => {
    if (!token) return;
    await apiAdminPost(`/admin/posts/${postId}/actions`, token, { action });
    await refreshCurrentPage();
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

  const loadClubMembers = async (clubId: string, q = '') => {
    if (!token) return;
    const members = await apiAdminGet<AdminClubMember[]>(`/admin/clubs/${clubId}/members?q=${encodeURIComponent(q)}`, token);
    setClubMembers(members);
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
                    <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">CampusLink</p>
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
                      : 'Operational visibility for CampusLink.'}
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
              <ShellCard title="Post Moderation">
                <div className="grid gap-4 lg:grid-cols-2">
                  {posts.map((post) => (
                    <div key={post.id} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{post.title || 'Untitled post'}</p>
                          <p className="mt-1 text-xs text-slate-500">by {post.author}{post.club ? ` · ${post.club}` : ''}</p>
                        </div>
                        <StatusBadge value={post.status} />
                      </div>
                      <p className="mt-3 line-clamp-3 text-sm text-slate-600">{post.preview || 'No content preview available.'}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{post.engagement.likes} likes</span>
                        <span>{post.engagement.comments} comments</span>
                        <span>{post.reportsCount} reports</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => void runPostAction(post.id, 'hide')}>Hide</Button>
                        <Button variant="outline" size="sm" onClick={() => void runPostAction(post.id, 'delete')}>Delete</Button>
                        <Button variant="outline" size="sm" onClick={() => void runPostAction(post.id, 'warn')}>Warn</Button>
                        <Button variant="outline" size="sm" onClick={() => void runPostAction(post.id, 'suspend_author')}>Suspend author</Button>
                        <Button variant="outline" size="sm" onClick={() => void runPostAction(post.id, 'escalate')}>Escalate</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ShellCard>
            ) : null}

            {!pageLoading && page === 'reports' ? (
              <ShellCard title="Reports">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                        <th className="px-3 py-3 whitespace-nowrap">Reporter</th>
                        <th className="px-3 py-3 whitespace-nowrap">Target</th>
                        <th className="px-3 py-3 whitespace-nowrap">Reason</th>
                        <th className="px-3 py-3 whitespace-nowrap">Evidence</th>
                        <th className="px-3 py-3 whitespace-nowrap">Frequency</th>
                        <th className="px-3 py-3 whitespace-nowrap">Severity</th>
                        <th className="px-3 py-3 whitespace-nowrap">Status</th>
                        <th className="px-3 py-3 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                          <td className="px-3 py-3 text-slate-700">{report.reporter}</td>
                          <td className="px-3 py-3 text-slate-600">{report.targetType}: {report.targetContent}</td>
                          <td className="px-3 py-3 text-slate-600">{report.reason}</td>
                          <td className="px-3 py-3 text-slate-500">{report.evidence || '—'}</td>
                          <td className="px-3 py-3 text-slate-600">{report.reportFrequency}</td>
                          <td className="px-3 py-3"><StatusBadge value={report.severity} /></td>
                          <td className="px-3 py-3"><StatusBadge value={report.status} /></td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => void apiAdminPost(`/admin/reports/${report.id}`, token!, { status: 'reviewing', assignToMe: true }, 'PATCH').then(refreshCurrentPage)}>Review</Button>
                              <Button variant="outline" size="sm" onClick={() => void apiAdminPost(`/admin/reports/${report.id}`, token!, { status: 'resolved' }, 'PATCH').then(refreshCurrentPage)}>Resolve</Button>
                              <Button variant="outline" size="sm" onClick={() => void apiAdminPost(`/admin/reports/${report.id}`, token!, { status: 'rejected' }, 'PATCH').then(refreshCurrentPage)}>Reject</Button>
                              <Button variant="outline" size="sm" onClick={() => void apiAdminPost(`/admin/reports/${report.id}`, token!, { status: 'escalated' }, 'PATCH').then(refreshCurrentPage)}>Escalate</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ShellCard>
            ) : null}

            {!pageLoading && page === 'verification' ? (
              <ShellCard title="Verification Queue">
                {verification.length === 0 ? (
                  <EmptyPanel title="No verification requests" body="New student or club verification requests will appear here." />
                ) : (
                  <div className="space-y-3">
                    {verification.map((item) => (
                      <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{item.type} verification</p>
                            <p className="mt-1 text-xs text-slate-500">Requested {formatDate(item.requestedAt)}</p>
                          </div>
                          <StatusBadge value={item.status} />
                        </div>
                        <p className="mt-3 text-sm text-slate-600">{item.notes || 'No verification notes provided.'}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" onClick={() => void apiAdminPost(`/admin/verification-requests/${item.id}`, token!, { status: 'approved' }, 'PATCH').then(refreshCurrentPage)}>Approve</Button>
                          <Button variant="outline" size="sm" onClick={() => void apiAdminPost(`/admin/verification-requests/${item.id}`, token!, { status: 'rejected' }, 'PATCH').then(refreshCurrentPage)}>Reject</Button>
                          <Button variant="outline" size="sm" onClick={() => void apiAdminPost(`/admin/verification-requests/${item.id}`, token!, { status: 'more_info' }, 'PATCH').then(refreshCurrentPage)}>Request more info</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ShellCard>
            ) : null}

            {!pageLoading && page === 'analytics' && analytics ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <ShellCard title="User Growth">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={analytics.userGrowth ?? []}>
                        <CartesianGrid stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Line dataKey="value" stroke="#0f172a" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </ShellCard>
                <ShellCard title="Active Colleges / Departments">
                  <div className="space-y-2">
                    {(analytics.activeColleges ?? []).map((item: any) => (
                      <div key={item.label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-700">{item.label}</span>
                        <span className="text-sm font-medium text-slate-900">{formatNumber(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </ShellCard>
                <ShellCard title="Top Clubs">
                  <div className="space-y-2">
                    {(analytics.topClubs ?? []).map((item: any) => (
                      <div key={item.label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-700">{item.label}</span>
                        <span className="text-sm font-medium text-slate-900">{formatNumber(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </ShellCard>
                <ShellCard title="Traffic Sources">
                  <div className="space-y-2">
                    {(analytics.trafficSources ?? []).map((item: any) => (
                      <div key={item.label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                        <span className="text-sm text-slate-700">{item.label}</span>
                        <span className="text-sm font-medium text-slate-900">{formatNumber(item.value)}%</span>
                      </div>
                    ))}
                  </div>
                </ShellCard>
              </div>
            ) : null}

            {!pageLoading && page === 'announcements' ? (
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <ShellCard title="Create Announcement">
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input placeholder="Announcement title" value={announcementDraft.title} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, title: event.target.value }))} />
                      <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" value={announcementDraft.audienceType} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, audienceType: event.target.value }))}>
                        <option value="all_users">All users</option>
                        <option value="specific_colleges">Specific colleges</option>
                        <option value="specific_clubs">Specific clubs</option>
                      </select>
                    </div>
                    <Textarea rows={8} placeholder="Announcement body" value={announcementDraft.content} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, content: event.target.value }))} />
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input placeholder="Audience IDs (comma-separated)" value={announcementDraft.audienceIds} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, audienceIds: event.target.value }))} />
                      <Input type="datetime-local" value={announcementDraft.scheduledFor} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, scheduledFor: event.target.value }))} />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={announcementDraft.pinned} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, pinned: event.target.checked }))} /> Pin announcement</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={announcementDraft.pushEnabled} onChange={(event) => setAnnouncementDraft((current) => ({ ...current, pushEnabled: event.target.checked }))} /> Push notification</label>
                    </div>
                    <Button
                      className="bg-slate-900 text-white hover:bg-slate-800"
                      onClick={() =>
                        void apiAdminPost('/admin/announcements', token!, {
                          ...announcementDraft,
                          audienceIds: announcementDraft.audienceIds.split(',').map((item) => item.trim()).filter(Boolean),
                        }).then(async () => {
                          setAnnouncementDraft({
                            title: '',
                            content: '',
                            audienceType: 'all_users',
                            audienceIds: '',
                            scheduledFor: '',
                            pinned: false,
                            pushEnabled: false,
                          });
                          await refreshCurrentPage();
                        })
                      }
                    >
                      Publish announcement
                    </Button>
                  </div>
                </ShellCard>
                <ShellCard title="Recent Announcements">
                  {announcements.length === 0 ? (
                    <EmptyPanel title="No announcements yet" body="Published or scheduled announcements will appear here." />
                  ) : (
                    <div className="space-y-3">
                      {announcements.map((item) => (
                        <div key={item.id} className="rounded-lg border border-slate-200 px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <StatusBadge value={item.status} />
                          </div>
                          <p className="mt-2 text-sm text-slate-600">{item.content}</p>
                          <p className="mt-3 text-xs text-slate-500">{item.audienceType} · {formatDate(item.scheduledFor || item.createdAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ShellCard>
              </div>
            ) : null}

            {!pageLoading && page === 'logs' ? (
              <ShellCard title="System Logs">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                        <th className="px-3 py-3 whitespace-nowrap">Timestamp</th>
                        <th className="px-3 py-3 whitespace-nowrap">Severity</th>
                        <th className="px-3 py-3 whitespace-nowrap">Actor</th>
                        <th className="px-3 py-3 whitespace-nowrap">Action</th>
                        <th className="px-3 py-3 whitespace-nowrap">Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b border-slate-100">
                          <td className="px-3 py-3 text-slate-500">{formatDate(log.createdAt)}</td>
                          <td className="px-3 py-3"><StatusBadge value={log.severity} /></td>
                          <td className="px-3 py-3 text-slate-700">{log.actor}</td>
                          <td className="px-3 py-3 text-slate-600">{log.actionType}</td>
                          <td className="px-3 py-3 text-slate-600">{log.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                    <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => void handlePasswordChange()} disabled={passwordState.isSaving}>
                      {passwordState.isSaving ? 'Saving...' : 'Change password'}
                    </Button>
                  </div>
                </ShellCard>
                <ShellCard title="Operational Settings">
                  {settings ? (
                    <div className="space-y-4">
                      {Object.entries(settings).map(([section, values]) => (
                        <div key={section} className="rounded-lg border border-slate-200 p-4">
                          <p className="text-sm font-semibold capitalize text-slate-900">{section}</p>
                          <div className="mt-3 space-y-2">
                            {Object.entries(values as Record<string, unknown>).map(([key, value]) => (
                              <div key={key} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
                                <span className="text-slate-600">{key}</span>
                                <span className="font-medium text-slate-900">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyPanel title="No settings available" body="Settings metadata will appear here once loaded." />
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
        open={Boolean(selectedClub && selectedClubDetail)}
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
        {selectedClubDetail ? (
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
    </div>
  );
}
