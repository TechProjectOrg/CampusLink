import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronDown, ChevronRight, ChevronUp, Clock, Edit2, Globe, KeyRound, Lock, MapPin, MonitorSmartphone, Save, Shield, Trash2, User, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { toast } from 'sonner@2.0.3';
import type { ApiUserSession, Student } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiChangePassword, apiFetchUserSessions, apiFetchUserSettings, apiRevokeUserSession, apiUpdateUserProfile, apiUpdateUserSettings, apiVerifyPasswordChange } from '../lib/authApi';

const PASSWORD_REQUIREMENTS = [
  'At least 8 characters long',
  'At least one lowercase letter',
  'At least one uppercase letter',
  'At least one number',
  'At least one special character (!@#$%^&*)',
];

function meetsPasswordRequirements(password: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/.test(password);
}

function formatSessionIp(ipAddress: string | null): string {
  if (!ipAddress) return 'Not available';
  if (ipAddress === '::1' || ipAddress === '127.0.0.1') {
    return '::1 (localhost)';
  }

  return ipAddress;
}

function formatSessionLastActive(lastSeenAt: string | null, createdAt: string): string {
  return new Date(lastSeenAt ?? createdAt).toLocaleString();
}

interface SettingsPageProps {
  student: Student;
  onEdit: (updates: Partial<Student>) => void;
  onUpdateSettings: (settings: any) => void;
}

export function SettingsPage({ student, onEdit, onUpdateSettings }: SettingsPageProps) {
  const auth = useAuth();
  const accountStudent = auth.currentUser ?? student;
  const isAlumni = auth.profile?.type === 'alumni';
  const yearValue = isAlumni
    ? auth.profile?.details?.passingYear ?? accountStudent.year
    : auth.profile?.details?.year ?? accountStudent.year;
  const currentCalendarYear = new Date().getFullYear();
  const passingYearOptions = Array.from({ length: 41 }, (_, index) => currentCalendarYear - 20 + index);
  const branchOptions = Array.from(
    new Set([
      'Computer Science',
      'Information Technology',
      'Electronics',
      'Mechanical',
      'Civil',
      accountStudent.branch,
    ].filter(Boolean))
  );

  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountData, setAccountData] = useState({
    username: accountStudent.username,
    branch: accountStudent.branch,
    year: String(yearValue ?? accountStudent.year),
  });

  const [passwordChangeStatus, setPasswordChangeStatus] = useState<'idle' | 'verifying' | 'changing'>('idle');
  const [securityView, setSecurityView] = useState<'menu' | 'password' | 'sessions'>('menu');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [sessions, setSessions] = useState<ApiUserSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    followRequests: true,
    newMessages: true,
    opportunityAlerts: true,
    clubUpdates: true,
    newPostAlerts: false
  });

  const [privacySettings, setPrivacySettings] = useState({
    accountType: accountStudent.accountType,
    showEmail: true,
    showProjects: true,
    allowMessages: true,
  });

  useEffect(() => {
    if (!auth.session?.userId) return;

    let cancelled = false;

    const loadSettings = async () => {
      setSettingsLoading(true);
      try {
        const settings = await apiFetchUserSettings(auth.session.userId, auth.session?.token);
        if (cancelled) return;

        setNotificationSettings(settings.notifications);
        setPrivacySettings(settings.privacy);
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Unable to load settings');
        }
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [auth.session?.userId, auth.session?.token]);

  useEffect(() => {
    if (isEditingAccount) return;

    setAccountData({
      username: accountStudent.username,
      branch: accountStudent.branch,
      year: String(yearValue ?? accountStudent.year),
    });
  }, [accountStudent, isEditingAccount, yearValue]);

  useEffect(() => {
    if (securityView !== 'sessions') return;
    if (!auth.session?.token) return;

    let cancelled = false;

    const loadSessions = async () => {
      setSessionsLoading(true);
      setSessionsError(null);

      try {
        const list = await apiFetchUserSessions(auth.session?.token);
        if (!cancelled) {
          setSessions(list);
        }
      } catch (err) {
        if (!cancelled) {
          setSessions([]);
          setSessionsError(err instanceof Error ? err.message : 'Unable to load active sessions');
        }
      } finally {
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    };

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [securityView, auth.session?.token]);

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();

    if (!auth.session?.userId) {
      toast.error('You must be signed in to change your password');
      return;
    }

    if (!passwordData.currentPassword.trim()) {
      toast.error('Current password is required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }

    if (!meetsPasswordRequirements(passwordData.newPassword)) {
      toast.error('New password does not meet the requirements');
      return;
    }

    setPasswordChangeStatus('verifying');

    const performPasswordChange = async () => {
      try {
        const verification = await apiVerifyPasswordChange(
          auth.session.userId,
          passwordData.currentPassword,
          auth.session.token
        );

        setPasswordChangeStatus('changing');

        await apiChangePassword(
          auth.session.userId,
          {
            changeToken: verification.changeToken,
            newPassword: passwordData.newPassword,
          },
          auth.session.token
        );

        toast.success('Password updated successfully');
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to change password');
      } finally {
        setPasswordChangeStatus('idle');
      }
    };

    void performPasswordChange();
  };

  const handleBackToSecurityMenu = () => {
    setSecurityView('menu');
  };

  const handleRevokeSession = async (session: ApiUserSession) => {
    if (!auth.session?.token) return;

    setRevokingSessionId(session.sessionId);

    try {
      await apiRevokeUserSession(session.sessionId, auth.session.token);

      if (session.isCurrent) {
        auth.logout();
        toast.success('This device has been logged out');
        return;
      }

      const nextSessions = await apiFetchUserSessions(auth.session.token);
      setSessions(nextSessions);
      toast.success('Session logged out');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to log out session');
    } finally {
      setRevokingSessionId(null);
    }
  };

  const renderPasswordForm = () => (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-gray-900">Change Password</h2>
          <p className="text-gray-600">Update your password to keep your account secure</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleBackToSecurityMenu}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </CardHeader>
      <CardContent>
        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">Current Password</Label>
            <Input
              id="current-password"
              type="password"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
              disabled={isPasswordActionInProgress}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
              disabled={isPasswordActionInProgress}
              required
            />
            {passwordData.newPassword.length > 0 && (
              <div className="rounded-xl border border-dashed bg-gray-50 p-4 space-y-2">
                <p className="text-sm font-medium text-gray-900">Password requirements</p>
                <ul className="space-y-2">
                  {visiblePasswordRequirements.length > 0 ? (
                    visiblePasswordRequirements.map((item) => (
                      <li key={item.requirement} className="text-sm text-gray-700">
                        {item.requirement}
                      </li>
                    ))
                  ) : (
                    <li className="text-sm text-emerald-700">
                      All password requirements are satisfied.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
              disabled={isPasswordActionInProgress}
              required
            />
            {passwordMismatch && (
              <p className="text-sm text-red-600">New password and confirmation do not match.</p>
            )}
          </div>
          <Button type="submit" className="w-full gradient-primary" disabled={isPasswordActionInProgress}>
            {passwordChangeStatus === 'verifying'
              ? 'Verifying...'
              : passwordChangeStatus === 'changing'
                ? 'Changing password...'
                : 'Change Password'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );

  const renderSessionsView = () => (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <h2 className="text-gray-900">Where You Are Logged In</h2>
          <p className="text-gray-600">Active sessions from your account.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleBackToSecurityMenu}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessionsLoading ? (
          <div className="rounded-xl border border-dashed bg-gray-50 p-4 text-sm text-gray-600">Loading active sessions...</div>
        ) : sessionsError ? (
          <div className="rounded-xl border border-dashed bg-red-50 p-4 text-sm text-red-700">{sessionsError}</div>
        ) : sessions.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-gray-50 p-4 text-sm text-gray-600">No active sessions found.</div>
        ) : (
          sessions.map((session) => (
          <div key={session.sessionId} className="rounded-2xl border bg-white p-4 shadow-sm">
            <button
              type="button"
              className="w-full text-left"
              onClick={() =>
                setExpandedSessionId((prev) =>
                  prev === session.sessionId ? null : session.sessionId
                )
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <MonitorSmartphone className="h-5 w-5 text-primary" />
                    <h3 className="text-gray-900">{session.deviceName}</h3>
                  </div>
                  {expandedSessionId !== session.sessionId && (
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        <Globe className="h-4 w-4" />
                        {session.browserName} on {session.platform}
                      </span>
                      <span className="inline-flex items-center gap-1 max-w-[280px] truncate">
                        <MapPin className="h-4 w-4 shrink-0" />
                        {session.locationLabel}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {formatSessionLastActive(session.lastSeenAt, session.createdAt)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {session.isCurrent ? (
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      Current session
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRevokeSession(session);
                      }}
                      disabled={revokingSessionId === session.sessionId}
                    >
                      {revokingSessionId === session.sessionId ? 'Logging out...' : 'Log out'}
                    </Button>
                  )}
                  {expandedSessionId === session.sessionId ? (
                    <ChevronUp className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  )}
                </div>
              </div>
            </button>
            {expandedSessionId === session.sessionId && (
              <div className="mt-4 rounded-xl border border-dashed bg-gray-50 p-3 text-sm text-gray-700 space-y-2">
                <p>
                  <span className="font-medium text-gray-900">Location:</span>{' '}
                  {session.locationLabel}
                </p>
                <p className="break-all">
                  <span className="font-medium text-gray-900">IP:</span>{' '}
                  {formatSessionIp(session.ipAddress)}
                </p>
                <p>
                  <span className="font-medium text-gray-900">Last active:</span>{' '}
                  {formatSessionLastActive(session.lastSeenAt, session.createdAt)}
                </p>
              </div>
            )}
          </div>
          ))
        )}
      </CardContent>
    </Card>
  );

  const passwordMismatch =
    passwordData.confirmPassword.length > 0 && passwordData.newPassword !== passwordData.confirmPassword;
  const passwordRequirementStatus = PASSWORD_REQUIREMENTS.map((requirement) => ({
    requirement,
    met:
      requirement === 'At least 8 characters long'
        ? passwordData.newPassword.length >= 8
        : requirement === 'At least one lowercase letter'
          ? /[a-z]/.test(passwordData.newPassword)
          : requirement === 'At least one uppercase letter'
            ? /[A-Z]/.test(passwordData.newPassword)
            : requirement === 'At least one number'
              ? /\d/.test(passwordData.newPassword)
              : /[!@#$%^&*]/.test(passwordData.newPassword),
  }));
  const visiblePasswordRequirements = passwordData.newPassword.length
    ? passwordRequirementStatus.filter((item) => !item.met)
    : [];
  const isPasswordActionInProgress = passwordChangeStatus !== 'idle';

  const persistNotificationSettings = async (nextNotifications: typeof notificationSettings) => {
    if (!auth.session?.userId) {
      toast.error('You must be signed in to save settings');
      return;
    }

    setSavingNotifications(true);
    try {
      const updated = await apiUpdateUserSettings(
        auth.session.userId,
        { notifications: nextNotifications },
        auth.session.token
      );
      setNotificationSettings(updated.notifications);
      setPrivacySettings(updated.privacy);
      onUpdateSettings({ notifications: updated.notifications });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save notification settings');
    } finally {
      setSavingNotifications(false);
    }
  };

  const persistPrivacySettings = async (nextPrivacy: typeof privacySettings) => {
    if (!auth.session?.userId) {
      toast.error('You must be signed in to save settings');
      return;
    }

    setSavingPrivacy(true);
    try {
      const updated = await apiUpdateUserSettings(
        auth.session.userId,
        { privacy: nextPrivacy },
        auth.session.token
      );
      setNotificationSettings(updated.notifications);
      setPrivacySettings(updated.privacy);
      onEdit({ accountType: updated.privacy.accountType });
      await auth.refreshProfile();
      onUpdateSettings({ privacy: updated.privacy });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to save privacy settings');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const handleCancelAccountEdit = () => {
    setAccountData({
      username: accountStudent.username,
      branch: accountStudent.branch,
      year: String(yearValue ?? accountStudent.year),
    });
    setIsEditingAccount(false);
  };

  const handleSaveAccount = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmedUsername = accountData.username.trim();
    const trimmedBranch = accountData.branch.trim();
    const parsedYear = Number.parseInt(accountData.year, 10);

    if (!trimmedUsername || !trimmedBranch || Number.isNaN(parsedYear)) {
      toast.error('Please complete all account fields');
      return;
    }

    if (!auth.session?.userId) {
      toast.error('You must be signed in to update your profile');
      return;
    }

    setIsSavingAccount(true);

    try {
      await apiUpdateUserProfile(
        auth.session.userId,
        {
          username: trimmedUsername,
          branch: trimmedBranch,
          year: parsedYear,
        },
        auth.session.token
      );

      onEdit({
        name: trimmedUsername,
        username: trimmedUsername,
        branch: trimmedBranch,
        year: parsedYear,
      });

      await auth.refreshProfile();
      setIsEditingAccount(false);
      toast.success('Account information updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update account information');
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = confirm(
      'Are you sure you want to delete your account? This action cannot be undone.'
    );
    if (!confirmed) return;

    const password = window.prompt('Enter your password to confirm account deletion:');
    if (!password) {
      toast.error('Account deletion cancelled (password required).');
      return;
    }

    try {
      await auth.deleteAccount(password);
      toast.success('Your account has been deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete account');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30 animate-fade-in pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <div className="mb-6">
          <h1 className="text-gray-900">Settings</h1>
          <p className="text-gray-600">Manage your account settings and preferences</p>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-white border rounded-xl p-1">
            <TabsTrigger value="account" className="data-[state=active]:bg-primary data-[state=active]:text-white">
              <User className="w-4 h-4 mr-2" />
              Account
            </TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-primary data-[state=active]:text-white">
              <Lock className="w-4 h-4 mr-2" />
              Security
            </TabsTrigger>
            <TabsTrigger value="notifications" className="data-[state=active]:bg-primary data-[state=active]:text-white">
              <Bell className="w-4 h-4 mr-2" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="privacy" className="data-[state=active]:bg-primary data-[state=active]:text-white">
              <Shield className="w-4 h-4 mr-2" />
              Privacy
            </TabsTrigger>
          </TabsList>

          {/* Account Settings */}
          <TabsContent value="account">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <h2 className="text-gray-900">Account Information</h2>
                  <p className="text-gray-600">Update your account details</p>
                </div>
                {!isEditingAccount ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsEditingAccount(true)}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" onClick={handleCancelAccountEdit}>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveAccount} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    {isEditingAccount ? (
                      <Input
                        id="username"
                        value={accountData.username}
                        onChange={(e) => setAccountData({ ...accountData, username: e.target.value })}
                      />
                    ) : (
                      <div className="rounded-xl border bg-white px-4 py-2 text-gray-900">{accountStudent.username}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" value={accountStudent.email} disabled />
                    <p className="text-xs text-gray-500">Email cannot be changed</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch">Branch</Label>
                    {isEditingAccount ? (
                      <select
                        id="branch"
                        value={accountData.branch}
                        onChange={(e) => setAccountData({ ...accountData, branch: e.target.value })}
                        className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        {branchOptions.map((branch) => (
                          <option key={branch} value={branch}>
                            {branch}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="rounded-xl border bg-white px-4 py-2 text-gray-900">{accountStudent.branch}</div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="year">{isAlumni ? 'Passing Year' : 'Current Year'}</Label>
                    {isEditingAccount ? (
                      <select
                        id="year"
                        value={accountData.year}
                        onChange={(e) => setAccountData({ ...accountData, year: e.target.value })}
                        className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        {isAlumni ? (
                          passingYearOptions.map((year) => (
                            <option key={year} value={year}>
                              {year}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="1">1st Year</option>
                            <option value="2">2nd Year</option>
                            <option value="3">3rd Year</option>
                            <option value="4">4th Year</option>
                          </>
                        )}
                      </select>
                    ) : (
                      <div className="rounded-xl border bg-white px-4 py-2 text-gray-900">
                        {isAlumni
                          ? `Passing Year ${yearValue}`
                          : `${yearValue}${yearValue === 1 ? 'st' : yearValue === 2 ? 'nd' : yearValue === 3 ? 'rd' : 'th'} Year`}
                      </div>
                    )}
                  </div>

                  {isEditingAccount && (
                    <Button type="submit" className="w-full gradient-primary" disabled={isSavingAccount}>
                      <Save className="w-4 h-4 mr-2" />
                      {isSavingAccount ? 'Saving...' : 'Save Changes'}
                    </Button>
                  )}
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security">
            <div className="space-y-4">
              {securityView === 'menu' && (
                <Card>
                  <CardHeader>
                    <h2 className="text-gray-900">Security</h2>
                    <p className="text-gray-600">Choose what you want to manage</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setSecurityView('password')}
                      className="flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-3">
                        <span className="rounded-full bg-primary/10 p-2 text-primary">
                          <KeyRound className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-gray-900">Change Password</span>
                          <span className="block text-sm text-gray-600">Update your account password</span>
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setSecurityView('sessions')}
                      className="flex w-full items-center justify-between rounded-2xl border bg-white px-4 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <span className="flex items-center gap-3">
                        <span className="rounded-full bg-primary/10 p-2 text-primary">
                          <MonitorSmartphone className="h-5 w-5" />
                        </span>
                        <span>
                          <span className="block text-gray-900">Where You Are Logged In</span>
                          <span className="block text-sm text-gray-600">See devices, browsers, and locations</span>
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>
                  </CardContent>
                </Card>
              )}

              {securityView === 'password' && renderPasswordForm()}
              {securityView === 'sessions' && renderSessionsView()}
            </div>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <h2 className="text-gray-900">Notification Preferences</h2>
                <p className="text-gray-600">Choose what notifications you want to receive</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Email Notifications</p>
                    <p className="text-sm text-gray-600">Receive notifications via email</p>
                  </div>
                  <Switch
                    checked={notificationSettings.emailNotifications}
                    disabled={settingsLoading || savingNotifications}
                    onCheckedChange={(checked) => {
                      const next = { ...notificationSettings, emailNotifications: checked };
                      setNotificationSettings(next);
                      void persistNotificationSettings(next);
                    }}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Follow Requests</p>
                    <p className="text-sm text-gray-600">When someone requests to follow you</p>
                  </div>
                  <Switch
                    checked={notificationSettings.followRequests}
                    disabled={settingsLoading || savingNotifications}
                    onCheckedChange={(checked) => {
                      const next = { ...notificationSettings, followRequests: checked };
                      setNotificationSettings(next);
                      void persistNotificationSettings(next);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">New Messages</p>
                    <p className="text-sm text-gray-600">When you receive a new message</p>
                  </div>
                  <Switch
                    checked={notificationSettings.newMessages}
                    disabled={settingsLoading || savingNotifications}
                    onCheckedChange={(checked) => {
                      const next = { ...notificationSettings, newMessages: checked };
                      setNotificationSettings(next);
                      void persistNotificationSettings(next);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Post Interactions</p>
                    <p className="text-sm text-gray-600">Likes, comments, and replies on your posts/comments</p>
                  </div>
                  <Switch
                    checked={notificationSettings.opportunityAlerts}
                    disabled={settingsLoading || savingNotifications}
                    onCheckedChange={(checked) => {
                      const next = { ...notificationSettings, opportunityAlerts: checked };
                      setNotificationSettings(next);
                      void persistNotificationSettings(next);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Club Updates</p>
                    <p className="text-sm text-gray-600">Updates from clubs you've joined</p>
                  </div>
                  <Switch
                    checked={notificationSettings.clubUpdates}
                    disabled={settingsLoading || savingNotifications}
                    onCheckedChange={(checked) => {
                      const next = { ...notificationSettings, clubUpdates: checked };
                      setNotificationSettings(next);
                      void persistNotificationSettings(next);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">New Post Alerts</p>
                    <p className="text-sm text-gray-600">Get alerts when people you follow publish a new post</p>
                  </div>
                  <Switch
                    checked={notificationSettings.newPostAlerts}
                    disabled={settingsLoading || savingNotifications}
                    onCheckedChange={(checked) => {
                      const next = { ...notificationSettings, newPostAlerts: checked };
                      setNotificationSettings(next);
                      void persistNotificationSettings(next);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Privacy Settings */}
          <TabsContent value="privacy">
            <Card>
              <CardHeader>
                <h2 className="text-gray-900">Privacy Settings</h2>
                <p className="text-gray-600">Control who can see your information</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="account-type">Account Type</Label>
                  <div className="flex items-center justify-between rounded-xl border bg-white px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-gray-900">
                        {privacySettings.accountType === 'private' ? 'Private' : 'Public'}
                      </p>
                    </div>
                    <Switch
                      checked={privacySettings.accountType === 'private'}
                      disabled={settingsLoading || savingPrivacy}
                      onCheckedChange={(checked) => {
                        const next = { ...privacySettings, accountType: checked ? 'private' : 'public' as const };
                        setPrivacySettings(next);
                        void persistPrivacySettings(next);
                      }}
                    />
                  </div>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Show Email Address</p>
                    <p className="text-sm text-gray-600">Display your email on your profile</p>
                  </div>
                  <Switch
                    checked={privacySettings.showEmail}
                    disabled={settingsLoading || savingPrivacy}
                    onCheckedChange={(checked) => {
                      const next = { ...privacySettings, showEmail: checked };
                      setPrivacySettings(next);
                      void persistPrivacySettings(next);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Show Projects</p>
                    <p className="text-sm text-gray-600">Display your projects on your profile</p>
                  </div>
                  <Switch
                    checked={privacySettings.showProjects}
                    disabled={settingsLoading || savingPrivacy}
                    onCheckedChange={(checked) => {
                      const next = { ...privacySettings, showProjects: checked };
                      setPrivacySettings(next);
                      void persistPrivacySettings(next);
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Allow Messages</p>
                    <p className="text-sm text-gray-600">Let others send you messages</p>
                  </div>
                  <Switch
                    checked={privacySettings.allowMessages}
                    disabled={settingsLoading || savingPrivacy}
                    onCheckedChange={(checked) => {
                      const next = { ...privacySettings, allowMessages: checked };
                      setPrivacySettings(next);
                      void persistPrivacySettings(next);
                    }}
                  />
                </div>

                <Separator className="my-6" />

                <div className="space-y-4">
                  <h3 className="text-gray-900 text-red-600">Danger Zone</h3>
                  <div className="p-4 border-2 border-red-200 rounded-lg bg-red-50">
                    <h4 className="text-gray-900 mb-2">Delete Account</h4>
                    <p className="text-sm text-gray-600 mb-4">
                      Once you delete your account, there is no going back. Please be certain.
                    </p>
                    <Button
                      onClick={handleDeleteAccount}
                      variant="destructive"
                      className="gradient-danger"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete My Account
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
