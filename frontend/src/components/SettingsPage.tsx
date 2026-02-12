import { useState } from 'react';
import { User, Lock, Bell, Shield, Trash2, Save, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Separator } from './ui/separator';
import { toast } from 'sonner@2.0.3';
import { Student } from '../types';
import { useAuth } from '../context/AuthContext';

interface SettingsPageProps {
  student: Student;
  onEdit: (updates: Partial<Student>) => void;
  onUpdateSettings: (settings: any) => void;
}

export function SettingsPage({ student, onEdit, onUpdateSettings }: SettingsPageProps) {
  const auth = useAuth();

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    followRequests: true,
    newMessages: true,
    opportunityAlerts: true,
    clubUpdates: true,
    weeklyDigest: false
  });

  const [privacySettings, setPrivacySettings] = useState({
    accountType: student.accountType,
    showEmail: true,
    showProjects: true,
    allowMessages: true,
  });

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    toast.success('Password updated successfully');
    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const handleSaveNotifications = () => {
    onUpdateSettings({ notifications: notificationSettings });
    toast.success('Notification preferences saved');
  };

  const handleSavePrivacy = () => {
    onUpdateSettings({ privacy: privacySettings });
    toast.success('Privacy settings saved');
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
              <CardHeader>
                <h2 className="text-gray-900">Account Information</h2>
                <p className="text-gray-600">Update your account details</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input id="name" defaultValue={student.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" defaultValue={student.email} disabled />
                  <p className="text-xs text-gray-500">Email cannot be changed</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch">Branch</Label>
                  <select
                    id="branch"
                    defaultValue={student.branch}
                    className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="Computer Science">Computer Science</option>
                    <option value="Information Technology">Information Technology</option>
                    <option value="Electronics">Electronics</option>
                    <option value="Mechanical">Mechanical</option>
                    <option value="Civil">Civil</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year</Label>
                  <select
                    id="year"
                    defaultValue={student.year}
                    className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                    <option value="4">4th Year</option>
                  </select>
                </div>
                <Button className="w-full gradient-primary">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <h2 className="text-gray-900">Change Password</h2>
                <p className="text-gray-600">Update your password to keep your account secure</p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-password">Current Password</Label>
                    <div className="relative">
                      <Input
                        id="current-password"
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full gradient-primary">
                    Update Password
                  </Button>
                </form>

                <Separator className="my-6" />


              </CardContent>
            </Card>
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
                    onCheckedChange={(checked) =>
                      setNotificationSettings({ ...notificationSettings, emailNotifications: checked })
                    }
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
                    onCheckedChange={(checked) =>
                      setNotificationSettings({ ...notificationSettings, followRequests: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">New Messages</p>
                    <p className="text-sm text-gray-600">When you receive a new message</p>
                  </div>
                  <Switch
                    checked={notificationSettings.newMessages}
                    onCheckedChange={(checked) =>
                      setNotificationSettings({ ...notificationSettings, newMessages: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Opportunity Alerts</p>
                    <p className="text-sm text-gray-600">New internships, hackathons, and events</p>
                  </div>
                  <Switch
                    checked={notificationSettings.opportunityAlerts}
                    onCheckedChange={(checked) =>
                      setNotificationSettings({ ...notificationSettings, opportunityAlerts: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Club Updates</p>
                    <p className="text-sm text-gray-600">Updates from clubs you've joined</p>
                  </div>
                  <Switch
                    checked={notificationSettings.clubUpdates}
                    onCheckedChange={(checked) =>
                      setNotificationSettings({ ...notificationSettings, clubUpdates: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Weekly Digest</p>
                    <p className="text-sm text-gray-600">Summary of your weekly activity</p>
                  </div>
                  <Switch
                    checked={notificationSettings.weeklyDigest}
                    onCheckedChange={(checked) =>
                      setNotificationSettings({ ...notificationSettings, weeklyDigest: checked })
                    }
                  />
                </div>

                <Button onClick={handleSaveNotifications} className="w-full gradient-primary">
                  <Save className="w-4 h-4 mr-2" />
                  Save Preferences
                </Button>
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
                  <select
                    id="account-type"
                    value={privacySettings.accountType}
                    onChange={(e) =>
                      setPrivacySettings({ ...privacySettings, accountType: e.target.value as any })
                    }
                    className="w-full px-4 py-2 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="public">Public - Anyone can follow instantly</option>
                    <option value="private">Private - Follow requests require approval</option>
                  </select>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Show Email Address</p>
                    <p className="text-sm text-gray-600">Display your email on your profile</p>
                  </div>
                  <Switch
                    checked={privacySettings.showEmail}
                    onCheckedChange={(checked) =>
                      setPrivacySettings({ ...privacySettings, showEmail: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Show Projects</p>
                    <p className="text-sm text-gray-600">Display your projects on your profile</p>
                  </div>
                  <Switch
                    checked={privacySettings.showProjects}
                    onCheckedChange={(checked) =>
                      setPrivacySettings({ ...privacySettings, showProjects: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-gray-900">Allow Messages</p>
                    <p className="text-sm text-gray-600">Let others send you messages</p>
                  </div>
                  <Switch
                    checked={privacySettings.allowMessages}
                    onCheckedChange={(checked) =>
                      setPrivacySettings({ ...privacySettings, allowMessages: checked })
                    }
                  />
                </div>


                <Button onClick={handleSavePrivacy} className="w-full gradient-primary">
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </Button>

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