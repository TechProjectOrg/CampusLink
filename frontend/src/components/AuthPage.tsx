import { useEffect, useState } from 'react';
import { Users, Mail, GraduationCap, Sparkles, TrendingUp, Award, Zap } from 'lucide-react';
import Lottie from 'lottie-react';
import loadingAnimation from '../assets/loading_animation.json';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader } from './ui/card';
import { Label } from './ui/label';
import { useAuth } from '../context/AuthContext';
import type { AuthOnboardingResponse } from '../lib/authApi';

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

function GoogleStudentButton({
  text,
  disabled,
  onCredential,
}: {
  text: string;
  disabled: boolean;
  onCredential: (credential: string) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

  useEffect(() => {
    let cancelled = false;

    async function renderGoogleButton() {
      if (!googleClientId) {
        setError('Missing `VITE_GOOGLE_CLIENT_ID` configuration.');
        return;
      }

      const container = document.getElementById(`google-student-button-${text}`);
      if (!container) return;

      try {
        await loadGoogleScript();
        if (cancelled || !window.google?.accounts?.id) return;

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
          text,
          width: Math.max(container.clientWidth || 0, 280),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Google Sign-In is unavailable');
      }
    }

    void renderGoogleButton();

    return () => {
      cancelled = true;
    };
  }, [googleClientId, onCredential, text]);

  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <div id={`google-student-button-${text}`} className="flex justify-center" />
      {error ? <p className="mt-2 text-center text-xs text-red-500">{error}</p> : null}
    </div>
  );
}

function isOnboardingResult(result: AuthOnboardingResponse | { profile: unknown; token?: string }): result is AuthOnboardingResponse {
  return 'onboardingRequired' in result;
}

export function AuthPage() {
  const auth = useAuth();

  const [activeForm, setActiveForm] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signupError, setSignupError] = useState('');
  const [loginMessage, setLoginMessage] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const [googleOnboarding, setGoogleOnboarding] = useState<AuthOnboardingResponse | null>(null);
  const [magicLinkOnboarding, setMagicLinkOnboarding] = useState<AuthOnboardingResponse | null>(null);
  const [onboardingForm, setOnboardingForm] = useState({
    username: '',
    branch: '',
    year: '',
    accountType: 'student' as const,
  });

  const resetMessages = () => {
    setLoginError('');
    setSignupError('');
    setLoginMessage('');
    setSignupMessage('');
  };

  const clearOnboardingState = () => {
    setGoogleOnboarding(null);
    setMagicLinkOnboarding(null);
    setOnboardingForm({
      username: '',
      branch: '',
      year: '',
      accountType: 'student',
    });
  };

  const applyOnboardingState = (result: AuthOnboardingResponse, source: 'google' | 'magic_link') => {
    setActiveForm('signup');
    setOnboardingForm({
      username: result.suggestedUsername ?? result.email.split('@')[0],
      branch: '',
      year: '',
      accountType: 'student',
    });
    if (source === 'google') {
      setGoogleOnboarding(result);
      setMagicLinkOnboarding(null);
    } else {
      setMagicLinkOnboarding(result);
      setGoogleOnboarding(null);
      setSignupEmail(result.email);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exchangeCode = params.get('authExchange');
    const authStatus = params.get('authStatus');

    if (!exchangeCode && !authStatus) {
      return;
    }

    const nextUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);

    if (authStatus === 'expired') {
      setLoginError('That magic link has expired. Request a fresh one to continue.');
      return;
    }

    if (authStatus === 'invalid') {
      setLoginError('That magic link is invalid. Request a new one and try again.');
      return;
    }

    if (authStatus === 'blocked') {
      setLoginError('Too many invalid link attempts were detected. Please wait before trying again.');
      return;
    }

    if (authStatus === 'error') {
      setLoginError('We could not finish that magic link sign in. Please request a new link.');
      return;
    }

    if (!exchangeCode) {
      return;
    }

    setIsLoading(true);
    void auth.exchangeMagicLink(exchangeCode)
      .then((result) => {
        if (isOnboardingResult(result)) {
          applyOnboardingState(result, 'magic_link');
          setSignupMessage('Your email is verified. Finish the last few account details.');
        } else {
          setLoginMessage('Magic link verified. Signing you in...');
        }
      })
      .catch((error) => {
        setLoginError(error instanceof Error ? error.message : 'Unable to finish magic link sign-in.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [auth]);

  const handleGoogleAuth = async (credential: string) => {
    resetMessages();
    setIsLoading(true);

    try {
      const result = await auth.authenticateWithGoogle(credential);
      if (isOnboardingResult(result)) {
        applyOnboardingState(result, 'google');
        setSignupMessage('Your Google account is verified. Finish the last few account details.');
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

  const handleSendMagicLink = async (mode: 'login' | 'signup') => {
    resetMessages();
    if (mode === 'signup') {
      clearOnboardingState();
    }

    const email = mode === 'login' ? loginEmail : signupEmail;
    setIsLoading(true);
    try {
      const result = await auth.sendMagicLink(email);
      if (mode === 'login') {
        setLoginMessage(result.message);
      } else {
        setSignupMessage(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send magic link';
      if (mode === 'login') {
        setLoginError(message);
      } else {
        setSignupError(message);
      }
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
        username: onboardingForm.username,
        branch: onboardingForm.branch,
        year: onboardingForm.year,
        accountType: onboardingForm.accountType,
      });
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to complete Google signup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMagicLinkOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!magicLinkOnboarding) return;

    resetMessages();
    setIsLoading(true);
    try {
      await auth.completeMagicLinkOnboarding({
        sessionId: magicLinkOnboarding.sessionId,
        username: onboardingForm.username,
        branch: onboardingForm.branch,
        year: onboardingForm.year,
        accountType: onboardingForm.accountType,
      });
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to complete account setup');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="cl-auth-page min-h-screen bg-gradient-to-br from-primary via-secondary to-purple-600 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="cl-auth-layout w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center relative z-10">
        <div className="cl-auth-branding space-y-6 text-center md:text-left animate-slide-in-up">
          <div className="inline-flex items-center gap-3 glass-morphism-solid rounded-2xl p-4 shadow-2xl hover-lift">
            <div className="gradient-primary text-white rounded-xl p-3 shadow-lg">
              <Users className="w-8 h-8" />
            </div>
            <span className="text-white text-2xl">CampusLynk</span>
          </div>

          <h1 className="text-white text-3xl md:text-4xl animate-slide-in-down">
            Connect. Collaborate. Succeed.
          </h1>

          <p className="text-white/90 text-lg">
            Join your college&apos;s professional network. Continue with Google or let a secure magic link bring you back in.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="glass-morphism-solid rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-white" />
                <p className="text-2xl text-white">500+</p>
              </div>
              <p className="text-sm text-white/80">Active Students</p>
            </div>
            <div className="glass-morphism-solid rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-white" />
                <p className="text-2xl text-white">100+</p>
              </div>
              <p className="text-sm text-white/80">Opportunities</p>
            </div>
            <div className="glass-morphism-solid rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '300ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-white" />
                <p className="text-2xl text-white">50+</p>
              </div>
              <p className="text-sm text-white/80">Active Clubs</p>
            </div>
            <div className="glass-morphism-solid rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '400ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <Award className="w-5 h-5 text-white" />
                <p className="text-2xl text-white">20+</p>
              </div>
              <p className="text-sm text-white/80">Events/Month</p>
            </div>
          </div>
        </div>

        <Card className="cl-auth-card shadow-2xl border-0 backdrop-blur-lg bg-white/95 animate-slide-in-up">
          <CardHeader>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-6 h-6 text-primary" />
              <h2 className="text-gray-900 text-center bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Welcome to CampusLynk
              </h2>
            </div>
            <p className="text-gray-600 text-center">Simple, secure authentication for your campus network</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setActiveForm('login');
                    resetMessages();
                  }}
                  className={`rounded-lg transition-all duration-300 py-2 ${
                    activeForm === 'login'
                      ? 'gradient-primary text-white shadow-lg'
                      : 'text-gray-700 hover:text-primary'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveForm('signup');
                    resetMessages();
                  }}
                  className={`rounded-lg transition-all duration-300 py-2 ${
                    activeForm === 'signup'
                      ? 'gradient-primary text-white shadow-lg'
                      : 'text-gray-700 hover:text-primary'
                  }`}
                >
                  Sign Up
                </button>
              </div>

              {activeForm === 'login' ? (
                <div className="space-y-4 animate-fade-slide-in">
                  <div className="space-y-1">
                    <h3 className="text-3xl text-slate-900">Welcome back</h3>
                    <p className="text-sm text-slate-600">
                      Use your college Google account or continue with your college email.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-slate-900">Continue with Google</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Use your official college Google account for the fastest sign in.
                    </p>
                    <div className="mt-4">
                      <GoogleStudentButton
                        text="continue_with"
                        disabled={isLoading}
                        onCredential={handleGoogleAuth}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span>OR</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSendMagicLink('login');
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="login-email">College Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="your.name@gbpuat.ac.in"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="pl-10 border-primary/20 focus:border-primary rounded-xl"
                          required
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        We&apos;ll send a secure sign-in link to your inbox.
                      </p>
                    </div>

                    {loginError ? <p className="text-sm text-red-500">{loginError}</p> : null}
                    {loginMessage ? <p className="text-sm text-emerald-600">{loginMessage}</p> : null}

                    <Button
                      type="submit"
                      className="w-full gradient-success shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                      disabled={isLoading}
                    >
                      {isLoading
                        ? <Lottie animationData={loadingAnimation} style={{ height: 50, width: 50 }} />
                        : 'Send Magic Link'}
                    </Button>
                  </form>
                </div>
              ) : googleOnboarding || magicLinkOnboarding ? (
                <div className="space-y-4 animate-fade-slide-in">
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-slate-900">
                      {googleOnboarding ? 'Google account verified' : 'Magic link verified'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Finish the last few details to complete your student account.
                    </p>
                  </div>

                  <form onSubmit={googleOnboarding ? handleGoogleOnboarding : handleMagicLinkOnboarding} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="onboarding-email">College Email</Label>
                      <Input
                        id="onboarding-email"
                        type="email"
                        value={(googleOnboarding ?? magicLinkOnboarding)?.email ?? ''}
                        className="border-primary/20 focus:border-primary rounded-xl bg-slate-50"
                        readOnly
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="onboarding-username">Username</Label>
                      <Input
                        id="onboarding-username"
                        type="text"
                        placeholder="Choose a username"
                        value={onboardingForm.username}
                        onChange={(e) => setOnboardingForm((current) => ({ ...current, username: e.target.value }))}
                        className="border-primary/20 focus:border-primary rounded-xl"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="onboarding-role">Role / Account Type</Label>
                      <Input
                        id="onboarding-role"
                        type="text"
                        value="Student"
                        className="border-primary/20 focus:border-primary rounded-xl bg-slate-50"
                        readOnly
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="onboarding-branch">Branch</Label>
                        <div className="relative">
                          <GraduationCap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                          <select
                            id="onboarding-branch"
                            value={onboardingForm.branch}
                            onChange={(e) => setOnboardingForm((current) => ({ ...current, branch: e.target.value }))}
                            className="w-full pl-10 pr-4 py-2 border border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                            required
                          >
                            <option value="">Select</option>
                            {BRANCH_OPTIONS.map((branch) => (
                              <option key={branch} value={branch}>
                                {branch}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="onboarding-year">Year</Label>
                        <select
                          id="onboarding-year"
                          value={onboardingForm.year}
                          onChange={(e) => setOnboardingForm((current) => ({ ...current, year: e.target.value }))}
                          className="w-full px-4 py-2 border border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                          required
                        >
                          <option value="">Select</option>
                          <option value="1">1st Year</option>
                          <option value="2">2nd Year</option>
                          <option value="3">3rd Year</option>
                          <option value="4">4th Year</option>
                        </select>
                      </div>
                    </div>

                    {signupError ? <p className="text-sm text-red-500">{signupError}</p> : null}
                    {signupMessage ? <p className="text-sm text-emerald-600">{signupMessage}</p> : null}

                    <Button type="submit" className="w-full gradient-success shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105" disabled={isLoading}>
                      {isLoading
                        ? <Lottie animationData={loadingAnimation} style={{ height: 50, width: 50 }} />
                        : 'Complete Account'}
                    </Button>
                  </form>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-slide-in">
                  <div className="space-y-1">
                    <h3 className="text-3xl text-slate-900">Create your account</h3>
                    <p className="text-sm text-slate-600">
                      Start with Google or your college email, then finish a few profile details.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-slate-900">Continue with Google</p>
                    <p className="mt-1 text-xs text-slate-600">
                      New Google users can finish onboarding after account verification.
                    </p>
                    <div className="mt-4">
                      <GoogleStudentButton
                        text="continue_with"
                        disabled={isLoading}
                        onCredential={handleGoogleAuth}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span>OR</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleSendMagicLink('signup');
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">College Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="your.name@gbpuat.ac.in"
                          value={signupEmail}
                          onChange={(e) => setSignupEmail(e.target.value)}
                          className="pl-10 border-primary/20 focus:border-primary rounded-xl"
                          required
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        We&apos;ll email a secure magic link. No password or OTP needed.
                      </p>
                    </div>

                    {signupError ? <p className="text-sm text-red-500">{signupError}</p> : null}
                    {signupMessage ? <p className="text-sm text-emerald-600">{signupMessage}</p> : null}

                    <Button
                      type="submit"
                      className="w-full gradient-success shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
                      disabled={isLoading}
                    >
                      {isLoading
                        ? <Lottie animationData={loadingAnimation} style={{ height: 50, width: 50 }} />
                        : 'Send Magic Link'}
                    </Button>

                    <p className="text-xs text-gray-500 text-center">
                      By signing up, you agree to our Terms of Service and Privacy Policy
                    </p>
                  </form>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
