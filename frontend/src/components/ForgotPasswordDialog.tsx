import { useEffect, useState } from 'react';
import { apiRequestPasswordReset, type PasswordResetRequestResult } from '../lib/authApi';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultIdentifier?: string;
}

export function ForgotPasswordDialog({ open, onOpenChange, defaultIdentifier = '' }: ForgotPasswordDialogProps) {
  const [identifier, setIdentifier] = useState(defaultIdentifier);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<PasswordResetRequestResult | null>(null);

  useEffect(() => {
    if (!open) {
      setError('');
      setResult(null);
      setIsSubmitting(false);
      setIdentifier(defaultIdentifier);
      return;
    }

    setIdentifier(defaultIdentifier);
  }, [defaultIdentifier, open]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setResult(null);
    setIsSubmitting(true);

    try {
      const response = await apiRequestPasswordReset(identifier);
      setResult(response);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to request a password reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Password reset</DialogTitle>
          <DialogDescription>
            Enter your email address or username and we&apos;ll look up the account, then send a secure password reset link to the matched email.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="forgot-password-identifier">Email or Username</Label>
            <Input
              id="forgot-password-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Enter your email or username"
              disabled={isSubmitting}
              required
            />
          </div>

          {result ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {result.message}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Sending reset link...' : 'Send reset link'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
