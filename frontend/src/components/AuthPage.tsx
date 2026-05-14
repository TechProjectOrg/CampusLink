import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff, GraduationCap, Lock, Mail, ShieldCheck, UserRound } from 'lucide-react';
import Lottie from 'lottie-react';
import loadingAnimation from '../assets/loading_animation.json';
import { useAuth } from '../context/AuthContext';
import { validatePassword, getPasswordValidationMessage } from '../lib/validation';
import type { GoogleOnboardingResponse } from '../lib/authApi';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { Label } from './ui/label';

const BRANCH_OPTIONS = [
  'Computer Engineering',
  'Information Technology',
  'Electronics and Communication Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
  'Industrial and Production Engineering',
  'Civil Engineering',
  'Agriculture Engineering',
];

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load Google Sign-In')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Google Sign-In'));
    document.head.appendChild(script);
  });
}

function GoogleAuthButton({
  disabled,
  onCredential,
}: {
  disabled: boolean;
  onCredential: (credential: string) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

  useEffect(() => {
    let cancelled = false;

    async function renderGoogleButton() {
      if (!googleClientId) {
        setError('Missing `VITE_GOOGLE_CLIENT_ID` configuration.');
        return;
      }

      const container = buttonRef.current;
      if (!container) return;

      try {
        await loadGoogleScript();
        if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;

        const width = Math.max(Math.floor(buttonRef.current.clientWidth || 360), 280);
        container.innerHTML = '';
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => {
            if (response.credential) {
              void onCredential(response.credential);
            }
          },
        });
        window.google.accounts.id.renderButton(container, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google Sign-In is unavailable');
      }
    }

    void renderGoogleButton();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          void renderGoogleButton();
        })
      : null;

    if (observer && buttonRef.current) {
      observer.observe(buttonRef.current);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [googleClientId, onCredential]);

  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <div ref={buttonRef} className="w-full min-h-11" />
      {error ? <p className="mt-2 text-sm text-rose-500">{error}</p> : null}
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
      <div className="h-px flex-1 bg-slate-200" />
      <span>OR</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function AuthMessage({
  tone,
  children,
}: {
  tone: 'error' | 'info';
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}
    >
      {children}
    </div>
  );
}

export function AuthPage() {
  const auth = useAuth();
  const [activeForm, setActiveForm] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');

  const [signupData, setSignupData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    branch: '',
    year: '',
  });
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirmPassword, setShowSignupConfirmPassword] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const [passwordValidationMessages, setPasswordValidationMessages] = useState<string[]>([]);
  const [otpValue, setOtpValue] = useState('');
  const [otpSession, setOtpSession] = useState<{
    verificationId: string;
    expiresAt: string;
    email: string;
  } | null>(null);
  const [googleOnboarding, setGoogleOnboarding] = useState<GoogleOnboardingResponse | null>(null);
  const [googleProfile, setGoogleProfile] = useState({
    fullName: '',
    username: '',
    branch: '',
    year: '',
    accountType: 'student' as const,
  });

  const resetMessages = () => {
    setLoginError('');
    setSignupError('');
    setSignupMessage('');
  };

  const resetGoogleOnboarding = () => {
    setGoogleOnboarding(null);
    setGoogleProfile({
      fullName: '',
      username: '',
      branch: '',
      year: '',
      accountType: 'student',
    });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);

    try {
      await auth.login(loginEmail, loginPassword);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleAuth = async (credential: string) => {
    resetMessages();
    setIsLoading(true);

    try {
      const result = await auth.authenticateWithGoogle(credential);
      if ('onboardingRequired' in result) {
        setActiveForm('signup');
        setOtpSession(null);
        setGoogleOnboarding(result);
        setGoogleProfile({
          fullName: result.fullName,
          username: result.suggestedUsername ?? result.fullName,
          branch: '',
          year: '',
          accountType: 'student',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed';
      if (activeForm === 'login') {
        setLoginError(message);
      } else {
        setSignupError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    resetGoogleOnboarding();

    if (signupData.password !== signupData.confirmPassword) {
      setSignupError('Passwords do not match');
      return;
    }

    if (!validatePassword(signupData.password)) {
      setSignupError('Password does not meet the requirements.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await auth.requestStudentSignupOtp({
        name: signupData.name,
        email: signupData.email,
        password: signupData.password,
        branch: signupData.branch,
        year: signupData.year,
      });
      setOtpSession({
        verificationId: response.verificationId,
        expiresAt: response.expiresAt,
        email: signupData.email,
      });
      setSignupMessage(response.message);
      setOtpValue('');
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to send verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpSession) return;

    resetMessages();
    setIsLoading(true);
    try {
      await auth.verifyStudentSignupOtp(otpSession.verificationId, otpValue);
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to verify the code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleOnboarding) return;

    resetMessages();
    setIsLoading(true);
    try {
      await auth.completeGoogleOnboarding({
        sessionId: googleOnboarding.sessionId,
        fullName: googleProfile.fullName,
        username: googleProfile.username,
        branch: googleProfile.branch,
        year: googleProfile.year,
        accountType: googleProfile.accountType,
      });
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to complete Google signup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.12),_transparent_32%),linear-gradient(180deg,_#f8fbff_0%,_#ffffff_52%,_#f5f7fb_100%)] px-4 py-10 text-slate-900">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_430px]">
        <section className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-medium text-sky-700 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            College authentication, simplified
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            One clean sign-in flow for Google and email.
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg">
            Continue with your college Google account or create an account with your college email and a verification code.
            No extra verification widgets, no duplicate steps.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Google first</p>
              <p className="mt-1 text-sm text-slate-500">Fast login for existing users and lightweight onboarding for new ones.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">OTP verified</p>
              <p className="mt-1 text-sm text-slate-500">Email ownership is confirmed on the server before account creation.</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Compact forms</p>
              <p className="mt-1 text-sm text-slate-500">Only the fields needed for the path you actually choose.</p>
            </div>
          </div>
        </section>

        <Card className="border-slate-200 bg-white/90 shadow-[0_20px_80px_-40px_rgba(15,23,42,0.35)] backdrop-blur">
          <CardContent className="p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setActiveForm('login');
                  resetMessages();
                }}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  activeForm === 'login' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveForm('signup');
                  resetMessages();
                }}
                className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  activeForm === 'signup' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Sign up
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">
                  {activeForm === 'login' ? 'Welcome back' : 'Create your account'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {activeForm === 'login'
                    ? 'Use Google or your email and password.'
                    : 'Choose Google or verify your college email with a one-time code.'}
                </p>
              </div>

              <GoogleAuthButton disabled={isLoading} onCredential={handleGoogleAuth} />

              <Divider />

              {activeForm === 'login' ? (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="login-email"
                        type="email"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="you@gbpuat.ac.in"
                        className="h-11 rounded-2xl border-slate-200 pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Password"
                        className="h-11 rounded-2xl border-slate-200 pl-10 pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                      >
                        {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {loginError ? <AuthMessage tone="error">{loginError}</AuthMessage> : null}

                  <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isLoading}>
                    {isLoading ? (
                      <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        Continue
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>
              ) : googleOnboarding ? (
                <form onSubmit={handleGoogleOnboarding} className="space-y-4">
                  <AuthMessage tone="info">
                    Your Google account is verified. Finish the last few details to create your student account.
                  </AuthMessage>

                  <div className="space-y-2">
                    <Label htmlFor="google-full-name">Full Name</Label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="google-full-name"
                        type="text"
                        value={googleProfile.fullName}
                        onChange={(e) => setGoogleProfile((current) => ({ ...current, fullName: e.target.value }))}
                        className="h-11 rounded-2xl border-slate-200 pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-email">College Email</Label>
                    <Input
                      id="google-email"
                      type="email"
                      value={googleOnboarding.email}
                      className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                      readOnly
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-username">Username</Label>
                    <Input
                      id="google-username"
                      type="text"
                      value={googleProfile.username}
                      onChange={(e) => setGoogleProfile((current) => ({ ...current, username: e.target.value }))}
                      className="h-11 rounded-2xl border-slate-200"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-role">Account Type</Label>
                    <Input
                      id="google-role"
                      type="text"
                      value="Student"
                      className="h-11 rounded-2xl border-slate-200 bg-slate-50"
                      readOnly
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="google-branch">Branch</Label>
                      <div className="relative">
                        <GraduationCap className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <select
                          id="google-branch"
                          value={googleProfile.branch}
                          onChange={(e) => setGoogleProfile((current) => ({ ...current, branch: e.target.value }))}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-slate-300"
                          required
                        >
                          <option value="">Select branch</option>
                          {BRANCH_OPTIONS.map((branch) => (
                            <option key={branch} value={branch}>
                              {branch}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="google-year">Year</Label>
                      <select
                        id="google-year"
                        value={googleProfile.year}
                        onChange={(e) => setGoogleProfile((current) => ({ ...current, year: e.target.value }))}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-300"
                        required
                      >
                        <option value="">Select year</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                    </div>
                  </div>

                  {signupError ? <AuthMessage tone="error">{signupError}</AuthMessage> : null}

                  <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isLoading}>
                    {isLoading ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} /> : 'Finish Google Signup'}
                  </Button>

                  <button
                    type="button"
                    onClick={resetGoogleOnboarding}
                    className="w-full text-sm text-slate-500 transition hover:text-slate-900"
                  >
                    Use email and password instead
                  </button>
                </form>
              ) : otpSession ? (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <AuthMessage tone="info">
                    {signupMessage || `We sent a verification code to ${otpSession.email}.`}
                  </AuthMessage>

                  <div className="space-y-2">
                    <Label htmlFor="signup-otp">Verification Code</Label>
                    <div className="flex justify-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4">
                      <InputOTP id="signup-otp" maxLength={6} value={otpValue} onChange={setOtpValue}>
                        <InputOTPGroup>
                          <InputOTPSlot index={0} />
                          <InputOTPSlot index={1} />
                          <InputOTPSlot index={2} />
                          <InputOTPSlot index={3} />
                          <InputOTPSlot index={4} />
                          <InputOTPSlot index={5} />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                    <p className="text-xs text-slate-500">
                      Code expires at {new Date(otpSession.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
                    </p>
                  </div>

                  {signupError ? <AuthMessage tone="error">{signupError}</AuthMessage> : null}

                  <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isLoading || otpValue.length !== 6}>
                    {isLoading ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} /> : 'Verify and Create Account'}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpSession(null);
                      setOtpValue('');
                      setSignupMessage('');
                      setSignupError('');
                    }}
                    className="w-full text-sm text-slate-500 transition hover:text-slate-900"
                  >
                    Edit details
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRequestOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <div className="relative">
                      <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-name"
                        type="text"
                        value={signupData.name}
                        onChange={(e) => setSignupData((current) => ({ ...current, name: e.target.value }))}
                        placeholder="Your full name"
                        className="h-11 rounded-2xl border-slate-200 pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">College Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-email"
                        type="email"
                        value={signupData.email}
                        onChange={(e) => setSignupData((current) => ({ ...current, email: e.target.value }))}
                        placeholder="you@gbpuat.ac.in"
                        className="h-11 rounded-2xl border-slate-200 pl-10"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="signup-branch">Branch</Label>
                      <div className="relative">
                        <GraduationCap className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <select
                          id="signup-branch"
                          value={signupData.branch}
                          onChange={(e) => setSignupData((current) => ({ ...current, branch: e.target.value }))}
                          className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-slate-300"
                          required
                        >
                          <option value="">Select branch</option>
                          {BRANCH_OPTIONS.map((branch) => (
                            <option key={branch} value={branch}>
                              {branch}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-year">Year</Label>
                      <select
                        id="signup-year"
                        value={signupData.year}
                        onChange={(e) => setSignupData((current) => ({ ...current, year: e.target.value }))}
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-slate-300"
                        required
                      >
                        <option value="">Select year</option>
                        <option value="1">1st Year</option>
                        <option value="2">2nd Year</option>
                        <option value="3">3rd Year</option>
                        <option value="4">4th Year</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-password"
                        type={showSignupPassword ? 'text' : 'password'}
                        value={signupData.password}
                        onChange={(e) => {
                          const nextPassword = e.target.value;
                          setSignupData((current) => ({ ...current, password: nextPassword }));
                          setPasswordValidationMessages(getPasswordValidationMessage(nextPassword));
                          setSignupError('');
                        }}
                        placeholder="Create a password"
                        className="h-11 rounded-2xl border-slate-200 pl-10 pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                      >
                        {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {passwordValidationMessages.length > 0 ? (
                      <ul className="space-y-1 text-xs text-rose-500">
                        {passwordValidationMessages.map((message) => (
                          <li key={message}>{message}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        id="signup-confirm-password"
                        type={showSignupConfirmPassword ? 'text' : 'password'}
                        value={signupData.confirmPassword}
                        onChange={(e) => {
                          const nextConfirmPassword = e.target.value;
                          setSignupData((current) => ({ ...current, confirmPassword: nextConfirmPassword }));
                          setSignupError(
                            signupData.password === nextConfirmPassword ? '' : 'Passwords do not match'
                          );
                        }}
                        placeholder="Confirm your password"
                        className="h-11 rounded-2xl border-slate-200 pl-10 pr-11"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupConfirmPassword((current) => !current)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                      >
                        {showSignupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {signupError ? <AuthMessage tone="error">{signupError}</AuthMessage> : null}
                  {signupMessage ? <AuthMessage tone="info">{signupMessage}</AuthMessage> : null}

                  <Button type="submit" className="h-11 w-full rounded-2xl" disabled={isLoading}>
                    {isLoading ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} /> : 'Create Account'}
                  </Button>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
