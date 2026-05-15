import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock, ArrowLeft } from 'lucide-react';
import Lottie from 'lottie-react';
import loadingAnimation from '../assets/loading_animation.json';
import { useAuth } from '../context/AuthContext';
import { apiCompletePasswordReset, apiExchangePasswordReset } from '../lib/authApi';
import { getPasswordValidationMessage, validatePassword } from '../lib/validation';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';

function FormMessage({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-primary/15 bg-primary/5 text-slate-700'
      }`}
    >
      {children}
    </div>
  );
}

function clearResetUrl(path: string) {
  window.history.replaceState({}, '', path);
}

function navigateTo(path: string, tab: string) {
  window.dispatchEvent(new Event('campuslynk:clear-auth-override'));
  window.history.pushState({ tab }, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function ResetPasswordPage() {
  const auth = useAuth();
  const initialSearchRef = useRef<string>(typeof window !== 'undefined' ? window.location.search : '');
  const [isLoading, setIsLoading] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [passwordResetEmail, setPasswordResetEmail] = useState('');
  const [passwordResetForm, setPasswordResetForm] = useState({
    newPassword: '',
    confirmPassword: '',
  });
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirmPassword, setShowResetConfirmPassword] = useState(false);
  const [passwordResetMessages, setPasswordResetMessages] = useState<string[]>([]);
  const [passwordResetError, setPasswordResetError] = useState('');
  const [passwordResetMessage, setPasswordResetMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(initialSearchRef.current);
    const resetExchangeCode = params.get('resetExchange');
    const authStatus = params.get('authStatus');
    const authFlow = params.get('authFlow');

    clearResetUrl('/reset-password');

    if (authFlow !== 'password-reset') {
      setPasswordResetError('This password reset link is invalid. Request a new one and try again.');
      return;
    }

    if (authStatus === 'expired') {
      setPasswordResetError('That password reset link has expired. Request a fresh one to continue.');
      return;
    }

    if (authStatus === 'invalid') {
      setPasswordResetError('That password reset link is invalid. Request a new one and try again.');
      return;
    }

    if (authStatus === 'blocked') {
      setPasswordResetError('Too many invalid password reset attempts were detected. Please wait before trying again.');
      return;
    }

    if (authStatus === 'error') {
      setPasswordResetError('We could not finish verifying that password reset link. Please request a new one.');
      return;
    }

    if (!resetExchangeCode) {
      setPasswordResetError('This password reset link is incomplete. Request a new one and try again.');
      return;
    }

    setIsLoading(true);
    void apiExchangePasswordReset(resetExchangeCode)
      .then((result) => {
        setResetToken(result.resetToken);
        setPasswordResetEmail(result.email);
        setPasswordResetMessage(`Create a new password for ${result.maskedEmail}.`);
      })
      .catch((error) => {
        setPasswordResetError(error instanceof Error ? error.message : 'Unable to open the password reset form.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordResetError('');

    if (!resetToken) {
      setPasswordResetError('This password reset link is no longer valid. Request a new one to continue.');
      return;
    }

    if (passwordResetForm.newPassword !== passwordResetForm.confirmPassword) {
      setPasswordResetError('Passwords do not match.');
      return;
    }

    if (!validatePassword(passwordResetForm.newPassword)) {
      setPasswordResetError('Password does not meet the requirements.');
      return;
    }

    setIsLoading(true);

    try {
      await apiCompletePasswordReset({
        resetToken,
        newPassword: passwordResetForm.newPassword,
        confirmPassword: passwordResetForm.confirmPassword,
      });

      if (auth.isAuthenticated) {
        navigateTo('/settings', 'settings');
        return;
      }

      navigateTo('/', 'feed');
    } catch (error) {
      setPasswordResetError(error instanceof Error ? error.message : 'Unable to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-secondary to-purple-600 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-2xl border-0 backdrop-blur-lg bg-white/95">
        <CardHeader className="space-y-3 px-6 pt-6 pb-2">
          <button
            type="button"
            onClick={() => navigateTo(auth.isAuthenticated ? '/settings' : '/', auth.isAuthenticated ? 'settings' : 'feed')}
            className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div>
            <h2 className="text-gray-900 text-3xl">Reset your password</h2>
            <p className="text-sm text-gray-600">
              Set a new password for your account using the same password rules used across CampusLynk.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          {passwordResetMessage ? <FormMessage tone="info">{passwordResetMessage}</FormMessage> : null}
          {passwordResetError ? <FormMessage tone="error">{passwordResetError}</FormMessage> : null}

          {resetToken ? (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="reset-password"
                    type={showResetPassword ? 'text' : 'password'}
                    value={passwordResetForm.newPassword}
                    onChange={(event) => {
                      const nextPassword = event.target.value;
                      setPasswordResetForm((current) => ({ ...current, newPassword: nextPassword }));
                      setPasswordResetMessages(getPasswordValidationMessage(nextPassword));
                      setPasswordResetError('');
                    }}
                    className="pl-10 pr-11 rounded-xl"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  >
                    {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordResetMessages.length > 0 ? (
                  <ul className="space-y-1 text-xs text-red-500">
                    {passwordResetMessages.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reset-confirm-password">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="reset-confirm-password"
                    type={showResetConfirmPassword ? 'text' : 'password'}
                    value={passwordResetForm.confirmPassword}
                    onChange={(event) => {
                      const confirmPassword = event.target.value;
                      setPasswordResetForm((current) => ({ ...current, confirmPassword }));
                      setPasswordResetError(passwordResetForm.newPassword === confirmPassword ? '' : 'Passwords do not match.');
                    }}
                    className="pl-10 pr-11 rounded-xl"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetConfirmPassword((current) => !current)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                  >
                    {showResetConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full rounded-2xl gradient-primary" disabled={isLoading}>
                {isLoading
                  ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} />
                  : 'Reset Password'}
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              className="w-full rounded-2xl"
              onClick={() => navigateTo(auth.isAuthenticated ? '/settings' : '/', auth.isAuthenticated ? 'settings' : 'feed')}
            >
              {isLoading ? 'Verifying reset link...' : passwordResetEmail ? 'Return' : 'Return'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
