import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
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
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { apiChangePassword, apiVerifyPasswordChange } from '../lib/authApi';
import { apiAdminGet, apiAdminPost, type AdminProfile } from './api';
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

const SEARCHABLE_PAGES = new Set<PageKey>(['users', 'posts', 'logs']);
const ADMIN_CACHE_MS = 30_000;

function getSearchKey(page: PageKey, search: string): string {
  return SEARCHABLE_PAGES.has(page) ? search.trim() : '';
}

function getAdminQueryKey(token: string, page: PageKey, search = '') {
  return ['admin', token, page, search] as const;
}

async function fetchAdminPageData(page: PageKey, token: string, search: string) {
  if (page === 'dashboard') return apiAdminGet('/admin/dashboard', token);
  if (page === 'users') return apiAdminGet(`/admin/users?q=${encodeURIComponent(search)}`, token);
  if (page === 'clubs') return apiAdminGet('/admin/clubs', token);
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

function ShellCard({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/20">
      <div className="absolute inset-y-0 right-0 w-[520px] max-w-[95vw] border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="h-[calc(100vh-73px)] overflow-y-auto p-5">{children}</div>
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
  const [collapsed, setCollapsed] = useState(false);
  const [token, setToken] = useState<string | null>(() => readAdminSession()?.token ?? null);
  const [admin, setAdmin] = useState<AdminProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(readAdminSession()?.token));
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedClub, setSelectedClub] = useState<any | null>(null);
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [selectedClubDetail, setSelectedClubDetail] = useState<any | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

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

  useEffect(() => {
    const handlePopState = () => setPage(parsePageFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (!token && !authLoading) {
      window.location.replace('/');
    }
  }, [token, authLoading]);

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
    queryKey: token ? getAdminQueryKey(token, 'dashboard') : ['admin', 'dashboard', 'anon'],
    queryFn: () => fetchAdminPageData('dashboard', token!, ''),
    enabled: canQueryAdmin,
    staleTime: ADMIN_CACHE_MS,
    gcTime: ADMIN_CACHE_MS * 10,
    refetchInterval: ADMIN_CACHE_MS,
  });

  const currentPageQuery = useQuery({
    queryKey: token ? getAdminQueryKey(token, page, searchKey) : ['admin', page, searchKey, 'anon'],
    queryFn: () => fetchAdminPageData(page, token!, searchKey),
    enabled: canQueryAdmin && page !== 'dashboard',
    staleTime: ADMIN_CACHE_MS,
    gcTime: ADMIN_CACHE_MS * 10,
    refetchInterval: page === 'reports' || page === 'logs' ? ADMIN_CACHE_MS : false,
  });

  const dashboard = dashboardQuery.data ?? null;
  const users = page === 'users' ? ((currentPageQuery.data as any[]) ?? []) : [];
  const clubs = page === 'clubs' ? ((currentPageQuery.data as any[]) ?? []) : [];
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

  const goTo = (nextPage: PageKey) => {
    const nextPath = nextPage === 'dashboard' ? '/admin' : `/admin/${nextPage}`;
    window.history.pushState({ page: nextPage }, '', nextPath);
    setPage(nextPage);
  };

  const prefetchPage = (nextPage: PageKey) => {
    if (!token || !admin || nextPage === 'dashboard') return;
    const nextSearchKey = getSearchKey(nextPage, search);
    void queryClient.prefetchQuery({
      queryKey: getAdminQueryKey(token, nextPage, nextSearchKey),
      queryFn: () => fetchAdminPageData(nextPage, token, nextSearchKey),
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
    await queryClient.invalidateQueries({ queryKey: getAdminQueryKey(token, page, searchKey), exact: true });
    if (page !== 'dashboard') {
      await queryClient.invalidateQueries({ queryKey: getAdminQueryKey(token, 'dashboard'), exact: true });
    }
  };

  const runUserAction = async (userId: string, action: string, note?: string) => {
    if (!token) return;
    await apiAdminPost(`/admin/users/${userId}/actions`, token, { action, note });
    await refreshCurrentPage();
    if (selectedUser?.id === userId) {
      setSelectedUserDetail(await apiAdminGet(`/admin/users/${userId}`, token));
    }
  };

  const runClubAction = async (clubId: string, action: string) => {
    if (!token) return;
    await apiAdminPost(`/admin/clubs/${clubId}/actions`, token, { action });
    await refreshCurrentPage();
    if (selectedClub?.id === clubId) {
      setSelectedClubDetail(await apiAdminGet(`/admin/clubs/${clubId}`, token));
    }
  };

  const runPostAction = async (postId: string, action: string) => {
    if (!token) return;
    await apiAdminPost(`/admin/posts/${postId}/actions`, token, { action });
    await refreshCurrentPage();
  };

  const openUserDrawer = async (user: any) => {
    if (!token) return;
    setSelectedUser(user);
    setSelectedUserDetail(await apiAdminGet(`/admin/users/${user.id}`, token));
  };

  const openClubDrawer = async (club: any) => {
    if (!token) return;
    setSelectedClub(club);
    setSelectedClubDetail(await apiAdminGet(`/admin/clubs/${club.id}`, token));
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

  const notificationCount = dashboard?.moderationQueue?.length ?? reports.filter((item) => ['open', 'reviewing', 'escalated'].includes(item.status)).length ?? 0;

  if (!token) return null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
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
          className="min-h-screen transition-all duration-200"
        >
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex items-center gap-4 px-6 py-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold text-slate-900">{pageTitle}</h1>
                <p className="mt-1 text-xs text-slate-500">
                  {dashboard ? `${dashboard.health?.apiResponseTime ?? 0} ms API · ${dashboard.health?.databaseLatency ?? 0} ms DB` : 'Operational visibility for CampusLink.'}
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
                <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Server healthy</Badge>
                <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
                  {formatNumber(dashboard?.metrics?.[1]?.value ?? 0)} active today
                </Badge>
                {pageRefreshing ? <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">Refreshing...</Badge> : null}
              </div>

              <button type="button" onClick={() => goTo('reports')} className="relative rounded-md border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-white">
                <Bell className="h-4 w-4" />
                {notificationCount ? <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{notificationCount}</span> : null}
              </button>
              <Button className="h-10 rounded-md bg-slate-900 text-white hover:bg-slate-800" onClick={() => goTo('reports')}>
                <AlertTriangle className="h-4 w-4" />
                Review Queue
              </Button>
            </div>
          </header>

          <main className="space-y-6 px-6 py-6">
            {pageLoading ? (
              <div className="grid gap-4 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-white" />
                ))}
              </div>
            ) : null}

            {!pageLoading && page === 'dashboard' && dashboard ? (
              <>
                <div className="grid gap-4 xl:grid-cols-4">
                  {dashboard.metrics?.map((metric: any) => (
                    <div key={metric.key} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">{metric.title}</p>
                          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatNumber(metric.value)}</p>
                        </div>
                        <StatusBadge value={metric.trend} />
                      </div>
                      <div className="mt-4">
                        <MiniSparkline values={metric.series ?? []} />
                      </div>
                    </div>
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
                        {[
                          ['API response time', `${dashboard.health?.apiResponseTime ?? 0} ms`, 'healthy'],
                          ['Database latency', `${dashboard.health?.databaseLatency ?? 0} ms`, 'healthy'],
                          ['WebSocket connections', formatNumber(dashboard.health?.websocketConnections ?? 0), 'healthy'],
                          ['Redis', dashboard.health?.redisHealth ?? 'healthy', dashboard.health?.redisHealth ?? 'healthy'],
                          ['Failed jobs', formatNumber(dashboard.health?.failedJobs ?? 0), dashboard.health?.failedJobs ? 'warning' : 'healthy'],
                          ['Storage usage', `${dashboard.health?.storageUsage ?? 0}%`, 'healthy'],
                          ['Cache hit rate', `${dashboard.health?.cacheHitRate ?? 0}%`, 'healthy'],
                        ].map(([label, value, tone]) => (
                          <div key={label} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                            <span className="text-sm text-slate-600">{label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-slate-900">{value}</span>
                              <StatusBadge value={tone} />
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
                <ShellCard title="User Management" action={<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => selectedUserIds.forEach((id) => void runUserAction(id, 'verify'))}>Bulk verify</Button><Button variant="outline" size="sm" onClick={() => selectedUserIds.forEach((id) => void runUserAction(id, 'suspend'))}>Bulk suspend</Button></div>}>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                          <th className="px-3 py-3 whitespace-nowrap"></th>
                          <th className="px-3 py-3 whitespace-nowrap">User</th>
                          <th className="px-3 py-3 whitespace-nowrap">College</th>
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
                              <button type="button" onClick={() => void openUserDrawer(user)} className="text-left">
                                <p className="font-medium text-slate-800">{user.username}</p>
                                <p className="text-xs text-slate-500">{user.email}</p>
                              </button>
                            </td>
                            <td className="px-3 py-3 text-slate-600">{user.college}</td>
                            <td className="px-3 py-3 text-slate-600">{formatNumber(user.followers)}</td>
                            <td className="px-3 py-3 text-slate-600">{formatNumber(user.postsCount)}</td>
                            <td className="px-3 py-3 text-slate-600">{formatNumber(user.reportsCount)}</td>
                            <td className="px-3 py-3 text-slate-500">{formatDate(user.lastActive)}</td>
                            <td className="px-3 py-3"><StatusBadge value={user.status} /></td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => void runUserAction(user.id, 'warn', 'Admin warning issued')}>Warn</Button>
                                <Button variant="outline" size="sm" onClick={() => void runUserAction(user.id, 'suspend')}>Suspend</Button>
                                <Button variant="outline" size="sm" onClick={() => void runUserAction(user.id, 'ban')}>Ban</Button>
                                <Button variant="outline" size="sm" onClick={() => void runUserAction(user.id, 'verify')}>Verify</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ShellCard>
              </>
            ) : null}

            {!pageLoading && page === 'clubs' ? (
              <ShellCard title="Club Management">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                        <th className="px-3 py-3 whitespace-nowrap">Club</th>
                        <th className="px-3 py-3 whitespace-nowrap">Members</th>
                        <th className="px-3 py-3 whitespace-nowrap">Activity</th>
                        <th className="px-3 py-3 whitespace-nowrap">Posts</th>
                        <th className="px-3 py-3 whitespace-nowrap">Reports</th>
                        <th className="px-3 py-3 whitespace-nowrap">Created by</th>
                        <th className="px-3 py-3 whitespace-nowrap">Verification</th>
                        <th className="px-3 py-3 whitespace-nowrap">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clubs.map((club) => (
                        <tr key={club.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-3">
                            <button type="button" onClick={() => void openClubDrawer(club)} className="text-left">
                              <p className="font-medium text-slate-800">{club.name}</p>
                              <p className="text-xs text-slate-500">{club.status}</p>
                            </button>
                          </td>
                          <td className="px-3 py-3 text-slate-600">{formatNumber(club.members)}</td>
                          <td className="px-3 py-3 text-slate-600">{formatNumber(club.activityScore)}</td>
                          <td className="px-3 py-3 text-slate-600">{formatNumber(club.postsCount)}</td>
                          <td className="px-3 py-3 text-slate-600">{formatNumber(club.reports)}</td>
                          <td className="px-3 py-3 text-slate-600">{club.createdBy}</td>
                          <td className="px-3 py-3"><StatusBadge value={club.verificationStatus} /></td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-2">
                              <Button variant="outline" size="sm" onClick={() => void runClubAction(club.id, 'verify')}>Verify</Button>
                              <Button variant="outline" size="sm" onClick={() => void runClubAction(club.id, 'feature')}>Feature</Button>
                              <Button variant="outline" size="sm" onClick={() => void runClubAction(club.id, 'freeze')}>Freeze</Button>
                              <Button variant="outline" size="sm" onClick={() => void runClubAction(club.id, 'delete')}>Delete</Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ShellCard>
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
          </main>
        </div>

      <RightDrawer
        open={Boolean(selectedUser && selectedUserDetail)}
        title={selectedUserDetail?.username ?? selectedUser?.username ?? 'User detail'}
        subtitle={selectedUserDetail?.email}
        onClose={() => {
          setSelectedUser(null);
          setSelectedUserDetail(null);
        }}
      >
        {selectedUserDetail ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                <div className="mt-2"><StatusBadge value={selectedUserDetail.status} /></div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Verified</p>
                <div className="mt-2"><StatusBadge value={selectedUserDetail.verified ? 'verified' : 'unverified'} /></div>
              </div>
            </div>

            <ShellCard title="Recent Posts">
              <div className="space-y-3">
                {(selectedUserDetail.recentPosts ?? []).map((post: any) => (
                  <div key={post.id} className="rounded-md border border-slate-200 px-3 py-3">
                    <p className="text-sm font-medium text-slate-800">{post.title || 'Untitled post'}</p>
                    <p className="mt-1 text-sm text-slate-500">{post.preview || 'No preview available.'}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <StatusBadge value={post.status} />
                      <p className="text-xs text-slate-500">{formatDate(post.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Clubs Joined">
              <div className="space-y-2">
                {(selectedUserDetail.clubs ?? []).map((club: any) => (
                  <div key={club.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
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
              <div className="space-y-2">
                {(selectedUserDetail.reports ?? []).map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-700">{report.reason}</span>
                    <StatusBadge value={report.status} />
                  </div>
                ))}
              </div>
            </ShellCard>

            <ShellCard title="Login History">
              <div className="space-y-2">
                {(selectedUserDetail.loginHistory ?? []).map((entry: any) => (
                  <div key={entry.id} className="rounded-md border border-slate-200 px-3 py-3">
                    <p className="text-sm font-medium text-slate-800">{entry.browser} · {entry.platform}</p>
                    <p className="mt-1 text-sm text-slate-500">{entry.location}</p>
                    <p className="mt-2 text-xs text-slate-500">{formatDate(entry.lastSeenAt || entry.createdAt)}</p>
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
        }}
      >
        {selectedClubDetail ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Verification</p>
                <div className="mt-2"><StatusBadge value={selectedClubDetail.verificationStatus} /></div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-slate-500">Status</p>
                <div className="mt-2"><StatusBadge value={selectedClubDetail.status} /></div>
              </div>
            </div>
            <ShellCard title="Top Posts">
              <div className="space-y-3">
                {(selectedClubDetail.topPosts ?? []).map((post: any) => (
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
                {(selectedClubDetail.moderationHistory ?? []).map((item: any) => (
                  <div key={item.id} className="rounded-md border border-slate-200 px-3 py-3">
                    <p className="text-sm text-slate-700">{item.summary}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDate(item.timestamp)}</p>
                  </div>
                ))}
              </div>
            </ShellCard>
          </div>
        ) : null}
      </RightDrawer>
    </div>
  );
}
