import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { toast } from 'sonner@2.0.3';
import { useAuth } from '../context/AuthContext';

interface SwitchToAlumniModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type StepType = 'confirm' | 'password' | 'email' | 'otp';

export function SwitchToAlumniModal({ open, onOpenChange, onSuccess }: SwitchToAlumniModalProps) {
  const auth = useAuth();
  const [currentStep, setCurrentStep] = useState<StepType>('confirm');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [changeToken, setChangeToken] = useState('');
  const [understoodWarning, setUnderstoodWarning] = useState(false);

  // Step 2: Password verification
  const [currentPassword, setCurrentPassword] = useState('');

  // Step 3: Email input
  const [newEmail, setNewEmail] = useState('');

  // Step 4: OTP verification
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (!open) {
      // Reset modal state when closed
      setCurrentStep('confirm');
      setIsLoading(false);
      setError('');
      setChangeToken('');
      setUnderstoodWarning(false);
      setCurrentPassword('');
      setNewEmail('');
      setOtp('');
      setOtpSent(false);
      setResendCooldown(0);
      return;
    }
  }, [open]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handlePasswordVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword.trim()) {
      setError('Current password is required');
      return;
    }

    if (!auth.session?.userId || !auth.session?.token) {
      setError('Authentication required');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/users/${auth.session.userId}/password/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.session.token}`,
          },
          body: JSON.stringify({ currentPassword }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Password verification failed');
      }

      const data = await response.json();
      setChangeToken(data.changeToken);
      setCurrentPassword('');
      setCurrentStep('email');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSubmission = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Invalid email format');
      return;
    }

    if (!auth.session?.userId || !auth.session?.token) {
      setError('Authentication required');
      return;
    }

    if (!changeToken) {
      setError('Password verification required. Please start over.');
      setCurrentStep('password');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/users/${auth.session.userId}/switch-to-alumni/request-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.session.token}`,
          },
          body: JSON.stringify({
            newEmail: trimmedEmail,
            changeToken,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to send verification code');
      }

      setOtpSent(true);
      setCurrentStep('otp');
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedOtp = (otp || '').replace(/\s/g, '');

    if (!trimmedOtp) {
      setError('Verification code is required');
      return;
    }

    if (trimmedOtp.length !== 6 || !/^\d+$/.test(trimmedOtp)) {
      setError('Verification code must be 6 digits');
      return;
    }

    if (!auth.session?.userId || !auth.session?.token) {
      setError('Authentication required');
      return;
    }

    const trimmedEmail = newEmail.trim().toLowerCase();

    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/users/${auth.session.userId}/switch-to-alumni/verify-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.session.token}`,
          },
          body: JSON.stringify({
            newEmail: trimmedEmail,
            otp: trimmedOtp,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to verify code');
      }

      // Success! Update auth context and close modal
      if (auth.updateUser) {
        auth.updateUser({
          ...auth.user,
          email: trimmedEmail,
          userType: 'alumni',
        });
      }

      toast.success('Successfully switched to alumni account');
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete the switch');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setIsLoading(true);

    try {
      if (!auth.session?.userId || !auth.session?.token || !changeToken) {
        throw new Error('Session expired. Please start over.');
      }

      const trimmedEmail = newEmail.trim().toLowerCase();

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/users/${auth.session.userId}/switch-to-alumni/request-otp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth.session.token}`,
          },
          body: JSON.stringify({
            newEmail: trimmedEmail,
            changeToken,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to resend verification code');
      }

      toast.success('Verification code sent');
      setOtp('');
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBack = () => {
    setError('');
    if (currentStep === 'password') {
      setCurrentStep('confirm');
    } else if (currentStep === 'email') {
      setChangeToken('');
      setCurrentPassword('');
      setCurrentStep('password');
    } else if (currentStep === 'otp') {
      setOtp('');
      setOtpSent(false);
      setCurrentStep('email');
    }
  };

  const stepTitles: Record<StepType, string> = {
    confirm: 'Switch to Alumni Account',
    password: 'Verify Your Password',
    email: 'Enter New Email',
    otp: 'Verify Your Email',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{stepTitles[currentStep]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Confirmation */}
          {currentStep === 'confirm' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 text-amber-600 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-semibold text-amber-900">Here's what will change:</p>
                    <ul className="space-y-1 text-amber-800 text-xs list-disc list-inside">
                      <li>Your email will change from your college email to a personal email</li>
                      <li>Your account type will change from Student to Alumni</li>
                      <li>All your posts, connections, chats, and club memberships remain unchanged</li>
                      <li>Your profile and data will be preserved</li>
                    </ul>
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={understoodWarning}
                  onChange={(e) => setUnderstoodWarning(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm text-slate-600">
                  I understand the changes and want to proceed with switching to an alumni account
                </span>
              </label>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setCurrentStep('password');
                    setError('');
                  }}
                  disabled={!understoodWarning}
                  className="flex-1"
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Password Verification */}
          {currentStep === 'password' && (
            <form onSubmit={handlePasswordVerification} className="space-y-4">
              <p className="text-sm text-slate-600">
                For security, please verify your current password before making this change.
              </p>

              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Verifying...' : 'Next'}
                </Button>
              </div>
            </form>
          )}

          {/* Step 3: Email Input */}
          {currentStep === 'email' && (
            <form onSubmit={handleEmailSubmission} className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter the personal email address you want to use for your alumni account.
              </p>

              <div className="space-y-2">
                <Label htmlFor="new-email">New Personal Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Sending code...' : 'Send Code'}
                </Button>
              </div>
            </form>
          )}

          {/* Step 4: OTP Verification */}
          {currentStep === 'otp' && (
            <form onSubmit={handleOtpVerification} className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  We sent a 6-digit verification code to <strong>{newEmail}</strong>. Enter it below.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="otp-code">Verification Code</Label>
                <Input
                  id="otp-code"
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setOtp(value);
                  }}
                  placeholder="000000"
                  maxLength={6}
                  disabled={isLoading}
                  autoFocus
                  className="text-center text-2xl tracking-widest font-mono"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button type="submit" disabled={isLoading} className="flex-1">
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isLoading ? 'Verifying...' : 'Complete'}
                </Button>
              </div>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isLoading || resendCooldown > 0}
                  className="text-sm text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0
                    ? `Resend code (${resendCooldown}s)`
                    : 'Didn\'t receive a code? Resend'}
                </button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
