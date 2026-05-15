import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  Mail,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
  UserRound,
  Zap,
} from 'lucide-react';
import Lottie from 'lottie-react';
import loadingAnimation from '../assets/loading_animation.json';
import { useAuth } from '../context/AuthContext';
import { apiCheckUsernameAvailability, type AuthOnboardingResponse } from '../lib/authApi';
import { getPasswordValidationMessage, validatePassword } from '../lib/validation';
import { ForgotPasswordDialog } from './ForgotPasswordDialog';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader } from './ui/card';
import { Input } from './ui/input';
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

const CURRENT_YEAR = new Date().getFullYear();
const PASSING_YEAR_OPTIONS = Array.from({ length: 41 }, (_, index) => CURRENT_YEAR - 20 + index);

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
let initializedGoogleClientId: string | null = null;
let activeGoogleCredentialHandler: ((credential: string) => void | Promise<void>) | null = null;

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

function initializeGoogleIdentity(clientId: string) {
  if (!window.google?.accounts?.id) {
    return;
  }

  if (initializedGoogleClientId === clientId) {
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => {
      if (response.credential && activeGoogleCredentialHandler) {
        void activeGoogleCredentialHandler(response.credential);
      }
    },
  });
  initializedGoogleClientId = clientId;
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
  const onCredentialRef = useRef(onCredential);
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

  useEffect(() => {
    onCredentialRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    const handleCredential = (credential: string) => onCredentialRef.current(credential);
    activeGoogleCredentialHandler = handleCredential;

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

        const width = Math.min(Math.max(Math.floor(buttonRef.current.clientWidth || 320), 280), 360);
        container.innerHTML = '';
        initializeGoogleIdentity(googleClientId);
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

    return () => {
      cancelled = true;
      if (activeGoogleCredentialHandler === handleCredential) {
        activeGoogleCredentialHandler = null;
      }
    };
  }, [googleClientId]);

  return (
    <div className={disabled ? 'pointer-events-none opacity-60' : ''}>
      <div ref={buttonRef} className="min-h-11 w-[320px]" />
      {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
      <div className="h-px flex-1 bg-slate-200" />
      <span>OR</span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

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

type ScreenMode = 'login' | 'signup';
type SignupStep = 'role' | 'method' | 'verify-email' | 'await-verification' | 'student-form' | 'alumni-form' | 'alumni-pending';
type AccountType = 'student' | 'alumni';

export function AuthPage() {
  const auth = useAuth();

  const [mode, setMode] = useState<ScreenMode>('login');
  const [signupStep, setSignupStep] = useState<SignupStep>('role');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AccountType | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginMessage, setLoginMessage] = useState('');

  const [signupError, setSignupError] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const [signupEmail, setSignupEmail] = useState('');
  const [onboardingSession, setOnboardingSession] = useState<AuthOnboardingResponse | null>(null);

  const [studentForm, setStudentForm] = useState({
    displayName: '',
    username: '',
    email: '',
    branch: '',
    year: '',
    password: '',
    confirmPassword: '',
  });
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showStudentConfirmPassword, setShowStudentConfirmPassword] = useState(false);
  const [studentPasswordMessages, setStudentPasswordMessages] = useState<string[]>([]);

  const [alumniForm, setAlumniForm] = useState({
    displayName: '',
    username: '',
    email: '',
    graduationYear: '',
    branch: '',
    currentStatus: '',
    password: '',
    confirmPassword: '',
    proofFiles: [] as File[],
  });
  const [showAlumniPassword, setShowAlumniPassword] = useState(false);
  const [showAlumniConfirmPassword, setShowAlumniConfirmPassword] = useState(false);
  const [alumniPasswordMessages, setAlumniPasswordMessages] = useState<string[]>([]);
  const [studentUsernameStatus, setStudentUsernameStatus] = useState<{ checking: boolean; available: boolean | null; message: string }>({
    checking: false,
    available: null,
    message: '',
  });
  const [alumniUsernameStatus, setAlumniUsernameStatus] = useState<{ checking: boolean; available: boolean | null; message: string }>({
    checking: false,
    available: null,
    message: '',
  });
  const [alumniResubmissionToken, setAlumniResubmissionToken] = useState<string | null>(null);
  const [alumniResubmissionNote, setAlumniResubmissionNote] = useState<string | null>(null);

  const resetMessages = () => {
    setLoginError('');
    setLoginMessage('');
    setSignupError('');
    setSignupMessage('');
  };

  const resetSignupFlow = () => {
    setSelectedRole(null);
    setSignupStep('role');
    setSignupEmail('');
    setOnboardingSession(null);
    setAlumniResubmissionToken(null);
    setAlumniResubmissionNote(null);
    setStudentForm({
      displayName: '',
      username: '',
      email: '',
      branch: '',
      year: '',
      password: '',
      confirmPassword: '',
    });
    setAlumniForm({
      displayName: '',
      username: '',
      email: '',
      graduationYear: '',
      branch: '',
      currentStatus: '',
      password: '',
      confirmPassword: '',
      proofFiles: [],
    });
    setStudentPasswordMessages([]);
    setAlumniPasswordMessages([]);
    setStudentUsernameStatus({ checking: false, available: null, message: '' });
    setAlumniUsernameStatus({ checking: false, available: null, message: '' });
    resetMessages();
  };

  const openSignup = () => {
    setMode('signup');
    setForgotPasswordOpen(false);
    resetSignupFlow();
  };

  const openLogin = () => {
    setMode('login');
    setForgotPasswordOpen(false);
    setSignupError('');
    setSignupMessage('');
  };

  const moveToOnboarding = (session: AuthOnboardingResponse) => {
    setMode('signup');
    setAlumniResubmissionToken(null);
    setAlumniResubmissionNote(null);
    setSelectedRole(session.accountType);
    setOnboardingSession(session);
    setSignupEmail(session.email);

    if (session.accountType === 'student') {
      setStudentForm((current) => ({
        ...current,
        displayName: session.fullName || current.displayName,
        username: session.suggestedUsername || current.username,
        email: session.email,
      }));
      setSignupStep('student-form');
      return;
    }

    setAlumniForm((current) => ({
      ...current,
      displayName: session.fullName || current.displayName,
      username: session.suggestedUsername || current.username,
      email: session.email,
    }));
    setSignupStep('alumni-form');
  };

  const moveToAlumniResubmission = (params: {
    token: string;
    email: string;
    displayName: string;
    username: string;
    graduationYear: number | null;
    branch: string | null;
    currentStatus: string | null;
    decisionNote: string | null;
  }) => {
    setMode('signup');
    setSelectedRole('alumni');
    setOnboardingSession(null);
    setAlumniResubmissionToken(params.token);
    setAlumniResubmissionNote(params.decisionNote);
    setSignupEmail(params.email);
    setAlumniForm((current) => ({
      ...current,
      displayName: params.displayName,
      username: params.username,
      email: params.email,
      graduationYear: params.graduationYear ? String(params.graduationYear) : '',
      branch: params.branch ?? '',
      currentStatus: params.currentStatus ?? '',
      password: '',
      confirmPassword: '',
      proofFiles: [],
    }));
    setSignupStep('alumni-form');
  };

  useEffect(() => {
    const username = studentForm.username.trim();
    if (signupStep !== 'student-form' || !username) {
      setStudentUsernameStatus({ checking: false, available: null, message: '' });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setStudentUsernameStatus({ checking: true, available: null, message: 'Checking username...' });
      void apiCheckUsernameAvailability(username)
        .then((result) => {
          setStudentUsernameStatus({
            checking: false,
            available: result.available,
            message: result.message || (result.available ? 'Username is available.' : 'That username is already taken.'),
          });
          if (result.normalizedUsername && result.normalizedUsername !== username) {
            setStudentForm((current) => ({ ...current, username: result.normalizedUsername }));
          }
        })
        .catch((error) => {
          setStudentUsernameStatus({
            checking: false,
            available: null,
            message: error instanceof Error ? error.message : 'Unable to check username.',
          });
        });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [signupStep, studentForm.username]);

  useEffect(() => {
    const username = alumniForm.username.trim();
    if (signupStep !== 'alumni-form' || !username) {
      setAlumniUsernameStatus({ checking: false, available: null, message: '' });
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAlumniUsernameStatus({ checking: true, available: null, message: 'Checking username...' });
      void apiCheckUsernameAvailability(username)
        .then((result) => {
          setAlumniUsernameStatus({
            checking: false,
            available: result.available,
            message: result.message || (result.available ? 'Username is available.' : 'That username is already taken.'),
          });
          if (result.normalizedUsername && result.normalizedUsername !== username) {
            setAlumniForm((current) => ({ ...current, username: result.normalizedUsername }));
          }
        })
        .catch((error) => {
          setAlumniUsernameStatus({
            checking: false,
            available: null,
            message: error instanceof Error ? error.message : 'Unable to check username.',
          });
        });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [signupStep, alumniForm.username]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const exchangeCode = params.get('authExchange');
    const authStatus = params.get('authStatus');
    const authFlow = params.get('authFlow');
    const verificationToken = params.get('verificationToken');
    const approvedEmail = params.get('email');
    const verificationStatus = params.get('verificationStatus');

    if (!exchangeCode && !authStatus && !authFlow) {
      return;
    }

    const nextUrl = `${window.location.pathname}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);

    setMode('signup');

    if (authStatus === 'expired') {
      setSignupStep('verify-email');
      setSignupError('That verification link has expired. Request a fresh one to continue.');
      return;
    }

    if (authStatus === 'invalid') {
      setSignupStep('verify-email');
      setSignupError('That verification link is invalid. Request a new one and try again.');
      return;
    }

    if (authStatus === 'blocked') {
      setSignupStep('verify-email');
      setSignupError('Too many invalid verification attempts were detected. Please wait before trying again.');
      return;
    }

    if (authStatus === 'error') {
      setSignupStep('verify-email');
      setSignupError('We could not finish verifying that email. Please request a new link.');
      return;
    }

    if (authFlow === 'login') {
      openLogin();
      if (approvedEmail) {
        setLoginEmail(approvedEmail);
      }
      if (verificationStatus === 'approved') {
        setLoginMessage('Your alumni verification has been approved. You can log in now.');
      }
      return;
    }

    if (authFlow === 'resubmit' && verificationToken) {
      setIsLoading(true);
      void auth.fetchAlumniVerificationResubmission(verificationToken)
        .then((context) => {
          resetMessages();
          setSignupMessage('Upload the additional proof requested by the reviewer, then resubmit your alumni verification.');
          moveToAlumniResubmission({
            token: verificationToken,
            ...context,
          });
        })
        .catch((error) => {
          openLogin();
          setLoginError(error instanceof Error ? error.message : 'Unable to open the alumni proof resubmission flow.');
        })
        .finally(() => {
          setIsLoading(false);
        });
      return;
    }

    if (!exchangeCode) {
      return;
    }

    setIsLoading(true);
    void auth.exchangeSignupVerification(exchangeCode)
      .then((session) => {
        resetMessages();
        setSignupMessage('Email verified. Complete your profile to finish creating your account.');
        moveToOnboarding(session);
      })
      .catch((error) => {
        setSignupStep('verify-email');
        setSignupError(error instanceof Error ? error.message : 'Unable to finish email verification.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [auth]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const handleLoginGoogle = async (credential: string) => {
    resetMessages();
    setIsLoading(true);

    try {
      await auth.authenticateWithGoogle({
        idToken: credential,
        intent: 'login',
      });
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupGoogle = async (credential: string) => {
    if (!selectedRole) {
      setSignupError('Choose whether you are signing up as a student or alumni first.');
      return;
    }

    resetMessages();
    setIsLoading(true);

    try {
      const result = await auth.authenticateWithGoogle({
        idToken: credential,
        intent: 'signup',
        accountType: selectedRole,
      });

      if ('onboardingRequired' in result) {
        moveToOnboarding(result);
        setSignupMessage('Google account verified. Complete the original signup form to finish your account.');
      }
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Google signup failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendVerificationLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedRole) {
      setSignupError('Choose whether you are signing up as a student or alumni first.');
      return;
    }

    resetMessages();
    setIsLoading(true);

    try {
      const response = await auth.sendSignupVerificationLink(signupEmail, selectedRole);
      setSignupMessage(response.message);
      setSignupStep('await-verification');
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to send verification link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onboardingSession) return;

    resetMessages();

    if (studentForm.password !== studentForm.confirmPassword) {
      setSignupError('Passwords do not match.');
      return;
    }

    if (!validatePassword(studentForm.password)) {
      setSignupError('Password does not meet the requirements.');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        sessionId: onboardingSession.sessionId,
        displayName: studentForm.displayName,
        username: studentForm.username,
        password: studentForm.password,
        branch: studentForm.branch,
        year: studentForm.year,
      };

      if (onboardingSession.provider === 'google') {
        await auth.completeGoogleOnboarding(payload);
      } else {
        await auth.completeStudentSignup(payload);
      }
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to complete student signup');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlumniSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!onboardingSession && !alumniResubmissionToken) return;

    resetMessages();

    if (!alumniResubmissionToken) {
      if (alumniForm.password !== alumniForm.confirmPassword) {
        setSignupError('Passwords do not match.');
        return;
      }

      if (!validatePassword(alumniForm.password)) {
        setSignupError('Password does not meet the requirements.');
        return;
      }
    }

    if (alumniForm.proofFiles.length === 0) {
      setSignupError('Upload at least one verification proof file.');
      return;
    }

    setIsLoading(true);
    try {
      const result = alumniResubmissionToken
        ? await auth.resubmitAlumniVerification({
          token: alumniResubmissionToken,
          displayName: alumniForm.displayName,
          username: alumniForm.username,
          graduationYear: alumniForm.graduationYear,
          branch: alumniForm.branch,
          currentStatus: alumniForm.currentStatus,
          proofFiles: alumniForm.proofFiles,
        })
        : await auth.signupAlumni({
          sessionId: onboardingSession!.sessionId,
          displayName: alumniForm.displayName,
          username: alumniForm.username,
          graduationYear: alumniForm.graduationYear,
          branch: alumniForm.branch,
          currentStatus: alumniForm.currentStatus,
          password: alumniForm.password,
          proofFiles: alumniForm.proofFiles,
        });
      setSignupStep('alumni-pending');
      setSignupMessage(result.message);
    } catch (error) {
      setSignupError(error instanceof Error ? error.message : 'Unable to complete alumni signup');
    } finally {
      setIsLoading(false);
    }
  };

  const renderSignupRoleStep = () => (
    <div className="space-y-4 animate-fade-slide-in">
      <div className="space-y-1">
        <h3 className="text-3xl text-slate-900">Choose your account type</h3>
        <p className="text-sm text-slate-600">
          Start by selecting the profile you want to create.
        </p>
      </div>

      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => {
            setSelectedRole('student');
            setSignupStep('method');
            resetMessages();
          }}
          className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left transition hover:border-primary/40 hover:bg-primary/10"
        >
          <p className="text-base font-semibold text-slate-900">Student</p>
          <p className="mt-1 text-sm text-slate-600">Official college email required.</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedRole('alumni');
            setSignupStep('method');
            resetMessages();
          }}
          className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-left transition hover:border-primary/40 hover:bg-primary/10"
        >
          <p className="text-base font-semibold text-slate-900">Alumni</p>
          <p className="mt-1 text-sm text-slate-600">Signup includes the existing proof verification process.</p>
        </button>
      </div>
    </div>
  );

  const renderSignupMethodStep = () => (
    <div className="space-y-4 animate-fade-slide-in">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-3xl text-slate-900">
            Sign up as {selectedRole === 'student' ? 'Student' : 'Alumni'}
          </h3>
          <p className="text-sm text-slate-600">
            Verify your identity with Google or your email, then complete the original signup form.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSignupStep('role');
            resetMessages();
          }}
          className="text-sm text-slate-500 transition hover:text-slate-900"
        >
          Change
        </button>
      </div>

      <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
        <p className="text-sm font-semibold text-slate-900">Continue with Google</p>
        <p className="mt-1 text-xs text-slate-600">
          {selectedRole === 'student'
            ? 'Use your official college Google account if you want the fastest setup.'
            : 'Use Google to prefill your profile details before uploading your alumni proof.'}
        </p>
        <div className="mt-4 flex justify-center">
          <GoogleAuthButton disabled={isLoading} onCredential={handleSignupGoogle} />
        </div>
      </div>

      <Divider />

      <div className="rounded-2xl border border-slate-200 p-4">
        <p className="text-sm font-semibold text-slate-900">Verify with email</p>
        <p className="mt-1 text-xs text-slate-600">
          Magic links are used only to verify email ownership during signup.
        </p>
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-2xl"
            onClick={() => {
              setSignupStep('verify-email');
              resetMessages();
            }}
          >
            Continue with Email
          </Button>
        </div>
      </div>

      {signupError ? <FormMessage tone="error">{signupError}</FormMessage> : null}
      {signupMessage ? <FormMessage tone="info">{signupMessage}</FormMessage> : null}
    </div>
  );

  const renderVerifyEmailStep = () => (
    <div className="space-y-4 animate-fade-slide-in">
      <div className="space-y-1">
        <h3 className="text-3xl text-slate-900">Verify your email</h3>
        <p className="text-sm text-slate-600">
          We&apos;ll send a secure verification link before you fill the signup form.
        </p>
      </div>

      <form onSubmit={handleSendVerificationLink} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="signup-email">
            {selectedRole === 'student' ? 'College Email' : 'Email'}
          </Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="signup-email"
              type="email"
              placeholder={selectedRole === 'student' ? 'you@gbpuat.ac.in' : 'you@example.com'}
              value={signupEmail}
              onChange={(event) => setSignupEmail(event.target.value)}
              className="pl-10 border-primary/20 focus:border-primary rounded-xl"
              required
            />
          </div>
          {selectedRole === 'student' ? (
            <p className="text-xs text-slate-500">Use your official college email.</p>
          ) : null}
        </div>

        {signupError ? <FormMessage tone="error">{signupError}</FormMessage> : null}
        {signupMessage ? <FormMessage tone="info">{signupMessage}</FormMessage> : null}

        <Button type="submit" className="w-full rounded-2xl gradient-success" disabled={isLoading}>
          {isLoading
            ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} />
            : 'Send Verification Link'}
        </Button>
      </form>
    </div>
  );

  const renderAwaitVerificationStep = () => (
    <div className="space-y-4 animate-fade-slide-in">
      <div className="space-y-1">
        <h3 className="text-3xl text-slate-900">Check your inbox</h3>
        <p className="text-sm text-slate-600">
          Open the verification link from your email to continue to the signup form.
        </p>
      </div>

      {signupMessage ? <FormMessage tone="info">{signupMessage}</FormMessage> : null}
      {signupError ? <FormMessage tone="error">{signupError}</FormMessage> : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        The email will take you back here and unlock the onboarding form automatically.
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full rounded-2xl"
        onClick={() => {
          setSignupStep('verify-email');
          resetMessages();
        }}
      >
        Use a different email
      </Button>
    </div>
  );

  const renderStudentForm = () => (
    <form onSubmit={handleStudentSignup} className="space-y-4 animate-fade-slide-in">
      <div className="space-y-1">
        <h3 className="text-3xl text-slate-900">Create your student account</h3>
        <p className="text-sm text-slate-600">
          Complete the original student signup form and create your password.
        </p>
      </div>

      {signupMessage ? <FormMessage tone="info">{signupMessage}</FormMessage> : null}

      <div className="space-y-2">
        <Label htmlFor="student-name">Display Name</Label>
        <div className="relative">
          <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="student-name"
            type="text"
            value={studentForm.displayName}
            onChange={(event) => setStudentForm((current) => ({ ...current, displayName: event.target.value }))}
            className="pl-10 rounded-xl"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-username">Username</Label>
        <Input
          id="student-username"
          type="text"
          value={studentForm.username}
          onChange={(event) => setStudentForm((current) => ({ ...current, username: event.target.value }))}
          className="rounded-xl"
          placeholder="your_handle"
          required
        />
        {studentUsernameStatus.message ? (
          <p className={`text-xs ${studentUsernameStatus.available === false ? 'text-red-500' : 'text-slate-500'}`}>
            {studentUsernameStatus.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-email">College Email</Label>
        <Input id="student-email" type="email" value={studentForm.email} className="rounded-xl bg-slate-50" readOnly />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="student-branch">Branch</Label>
          <div className="relative">
            <GraduationCap className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 z-10" />
            <select
              id="student-branch"
              value={studentForm.branch}
              onChange={(event) => setStudentForm((current) => ({ ...current, branch: event.target.value }))}
              className="w-full rounded-xl border border-primary/20 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40"
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
          <Label htmlFor="student-year">Year</Label>
          <select
            id="student-year"
            value={studentForm.year}
            onChange={(event) => setStudentForm((current) => ({ ...current, year: event.target.value }))}
            className="w-full rounded-xl border border-primary/20 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
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

      <div className="space-y-2">
        <Label htmlFor="student-password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="student-password"
            type={showStudentPassword ? 'text' : 'password'}
            value={studentForm.password}
            onChange={(event) => {
              const nextPassword = event.target.value;
              setStudentForm((current) => ({ ...current, password: nextPassword }));
              setStudentPasswordMessages(getPasswordValidationMessage(nextPassword));
              setSignupError('');
            }}
            className="pl-10 pr-11 rounded-xl"
            required
          />
          <button
            type="button"
            onClick={() => setShowStudentPassword((current) => !current)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
          >
            {showStudentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {studentPasswordMessages.length > 0 ? (
          <ul className="space-y-1 text-xs text-red-500">
            {studentPasswordMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-confirm-password">Confirm Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="student-confirm-password"
            type={showStudentConfirmPassword ? 'text' : 'password'}
            value={studentForm.confirmPassword}
            onChange={(event) => {
              const confirmPassword = event.target.value;
              setStudentForm((current) => ({ ...current, confirmPassword }));
              setSignupError(studentForm.password === confirmPassword ? '' : 'Passwords do not match.');
            }}
            className="pl-10 pr-11 rounded-xl"
            required
          />
          <button
            type="button"
            onClick={() => setShowStudentConfirmPassword((current) => !current)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
          >
            {showStudentConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {signupError ? <FormMessage tone="error">{signupError}</FormMessage> : null}

      <Button
        type="submit"
        className="w-full rounded-2xl gradient-success"
        disabled={isLoading || studentUsernameStatus.available === false || studentUsernameStatus.checking}
      >
        {isLoading
          ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} />
          : 'Create Student Account'}
      </Button>
    </form>
  );

  const renderAlumniForm = () => (
    <form onSubmit={handleAlumniSignup} className="space-y-4 animate-fade-slide-in">
      <div className="space-y-1">
        <h3 className="text-3xl text-slate-900">
          {alumniResubmissionToken ? 'Upload more alumni proof' : 'Create your alumni account'}
        </h3>
        <p className="text-sm text-slate-600">
          {alumniResubmissionToken
            ? 'Update your details if needed and upload the additional proof requested by the reviewer.'
            : 'Complete the original alumni signup form and upload your verification proof.'}
        </p>
      </div>

      {signupMessage ? <FormMessage tone="info">{signupMessage}</FormMessage> : null}
      {alumniResubmissionToken ? (
        <FormMessage tone="info">
          {alumniResubmissionNote?.trim()
            ? `Reviewer note: ${alumniResubmissionNote}`
            : 'A reviewer requested more proof before your alumni account can be approved.'}
        </FormMessage>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="alumni-name">Display Name</Label>
        <Input
          id="alumni-name"
          type="text"
          value={alumniForm.displayName}
          onChange={(event) => setAlumniForm((current) => ({ ...current, displayName: event.target.value }))}
          className="rounded-xl"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="alumni-username">Username</Label>
        <Input
          id="alumni-username"
          type="text"
          value={alumniForm.username}
          onChange={(event) => setAlumniForm((current) => ({ ...current, username: event.target.value }))}
          className="rounded-xl"
          placeholder="your_handle"
          required
        />
        {alumniUsernameStatus.message ? (
          <p className={`text-xs ${alumniUsernameStatus.available === false ? 'text-red-500' : 'text-slate-500'}`}>
            {alumniUsernameStatus.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="alumni-email">Email</Label>
        <Input id="alumni-email" type="email" value={alumniForm.email} className="rounded-xl bg-slate-50" readOnly />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="alumni-graduation-year">Graduation Year</Label>
          <select
            id="alumni-graduation-year"
            value={alumniForm.graduationYear}
            onChange={(event) => setAlumniForm((current) => ({ ...current, graduationYear: event.target.value }))}
            className="w-full rounded-xl border border-primary/20 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
            required
          >
            <option value="">Select</option>
            {PASSING_YEAR_OPTIONS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="alumni-branch">Branch</Label>
          <div className="relative">
            <GraduationCap className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 z-10" />
            <select
              id="alumni-branch"
              value={alumniForm.branch}
              onChange={(event) => setAlumniForm((current) => ({ ...current, branch: event.target.value }))}
              className="w-full rounded-xl border border-primary/20 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary/40"
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
      </div>

      <div className="space-y-2">
        <Label htmlFor="alumni-status">Current working status</Label>
        <Input
          id="alumni-status"
          type="text"
          value={alumniForm.currentStatus}
          onChange={(event) => setAlumniForm((current) => ({ ...current, currentStatus: event.target.value }))}
          className="rounded-xl"
          placeholder="Software Engineer at XYZ"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="alumni-proof">Verification Proof</Label>
        <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-4 text-sm text-slate-700 transition hover:border-primary/50 hover:bg-primary/10">
          <Upload className="h-4 w-4" />
          <span>
            {alumniForm.proofFiles.length > 0
              ? `${alumniForm.proofFiles.length} file(s) selected`
              : 'Upload PDF, JPG, PNG, or WEBP proof files'}
          </span>
          <input
            id="alumni-proof"
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              setAlumniForm((current) => ({ ...current, proofFiles: files }));
            }}
          />
        </label>
      </div>

      {!alumniResubmissionToken ? (
        <>
          <div className="space-y-2">
            <Label htmlFor="alumni-password">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="alumni-password"
                type={showAlumniPassword ? 'text' : 'password'}
                value={alumniForm.password}
                onChange={(event) => {
                  const nextPassword = event.target.value;
                  setAlumniForm((current) => ({ ...current, password: nextPassword }));
                  setAlumniPasswordMessages(getPasswordValidationMessage(nextPassword));
                  setSignupError('');
                }}
                className="pl-10 pr-11 rounded-xl"
                required
              />
              <button
                type="button"
                onClick={() => setShowAlumniPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              >
                {showAlumniPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {alumniPasswordMessages.length > 0 ? (
              <ul className="space-y-1 text-xs text-red-500">
                {alumniPasswordMessages.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="alumni-confirm-password">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="alumni-confirm-password"
                type={showAlumniConfirmPassword ? 'text' : 'password'}
                value={alumniForm.confirmPassword}
                onChange={(event) => {
                  const confirmPassword = event.target.value;
                  setAlumniForm((current) => ({ ...current, confirmPassword }));
                  setSignupError(alumniForm.password === confirmPassword ? '' : 'Passwords do not match.');
                }}
                className="pl-10 pr-11 rounded-xl"
                required
              />
              <button
                type="button"
                onClick={() => setShowAlumniConfirmPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
              >
                {showAlumniConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {signupError ? <FormMessage tone="error">{signupError}</FormMessage> : null}

      <Button
        type="submit"
          className="w-full rounded-2xl gradient-success"
          disabled={isLoading || alumniUsernameStatus.available === false || alumniUsernameStatus.checking}
        >
        {isLoading
          ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} />
          : alumniResubmissionToken ? 'Resubmit Alumni Proof' : 'Submit Alumni Signup'}
      </Button>
    </form>
  );

  const renderAlumniPending = () => (
    <div className="space-y-4 animate-fade-slide-in">
      <div className="space-y-1">
        <h3 className="text-3xl text-slate-900">Verification submitted</h3>
        <p className="text-sm text-slate-600">
          Your alumni proof has been sent for review. We&apos;ll unlock your account after approval.
        </p>
      </div>

      {signupMessage ? <FormMessage tone="info">{signupMessage}</FormMessage> : null}
      {signupError ? <FormMessage tone="error">{signupError}</FormMessage> : null}

      <Button
        type="button"
        className="w-full rounded-2xl"
        onClick={() => {
          openLogin();
          resetSignupFlow();
        }}
      >
        Return to Login
      </Button>
    </div>
  );

  const renderSignupBody = () => {
    switch (signupStep) {
      case 'role':
        return renderSignupRoleStep();
      case 'method':
        return renderSignupMethodStep();
      case 'verify-email':
        return renderVerifyEmailStep();
      case 'await-verification':
        return renderAwaitVerificationStep();
      case 'student-form':
        return renderStudentForm();
      case 'alumni-form':
        return renderAlumniForm();
      case 'alumni-pending':
        return renderAlumniPending();
      default:
        return renderSignupRoleStep();
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
            Log in with your email and password, or sign up through a verified onboarding flow for students and alumni.
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
                {mode === 'login' ? 'Welcome to CampusLynk' : 'Create Your Account'}
              </h2>
            </div>
            <p className="text-gray-600 text-center">
              {mode === 'signup'
                ? 'Signup begins with role selection, verification, and then the original onboarding form.'
                  : ''}
            </p>
            {mode === 'login' ? (
              <p className="text-sm text-gray-500 text-center">
                Sign in to connect with your campus network.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {mode === 'signup' ? (
                <button
                  type="button"
                  onClick={() => {
                    if (signupStep === 'role') {
                      openLogin();
                      return;
                    }

                    if (signupStep === 'method') {
                      setSignupStep('role');
                      resetMessages();
                      return;
                    }

                    if (signupStep === 'verify-email' || signupStep === 'await-verification') {
                      setSignupStep('method');
                      resetMessages();
                      return;
                    }

                    if (signupStep === 'student-form' || signupStep === 'alumni-form') {
                      if (alumniResubmissionToken) {
                        openLogin();
                        resetSignupFlow();
                        return;
                      }

                      setSignupStep(onboardingSession?.provider === 'google' ? 'method' : 'verify-email');
                      resetMessages();
                    }
                  }}
                  className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-900"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : null}

              {mode === 'login' ? (
                <div className="space-y-4 animate-fade-slide-in">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <Input
                          id="login-email"
                          type="email"
                          value={loginEmail}
                          onChange={(event) => setLoginEmail(event.target.value)}
                          className="pl-10 rounded-xl"
                          placeholder="you@example.com"
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
                          onChange={(event) => setLoginPassword(event.target.value)}
                          className="pl-10 pr-11 rounded-xl"
                          placeholder="Enter your password"
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

                    {loginMessage ? <FormMessage tone="info">{loginMessage}</FormMessage> : null}
                    {loginError ? <FormMessage tone="error">{loginError}</FormMessage> : null}

                    <div className="mx-auto w-full max-w-[320px]">
                      <Button type="submit" className="w-full rounded-2xl gradient-primary" disabled={isLoading}>
                        {isLoading
                          ? <Lottie animationData={loadingAnimation} style={{ height: 40, width: 40 }} />
                          : (
                            <span className="inline-flex items-center gap-2">
                              Login
                              <ArrowRight className="h-4 w-4" />
                            </span>
                          )}
                      </Button>
                    </div>
                  </form>

                  <Divider />

                  <div className="flex justify-center">
                    <GoogleAuthButton disabled={isLoading} onCredential={handleLoginGoogle} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-normal text-slate-500">
                    <p>
                      Forgot your password?{' '}
                      <button
                        type="button"
                        onClick={() => setForgotPasswordOpen(true)}
                        className="font-normal text-blue-600 transition hover:underline"
                      >
                        Forgot password
                      </button>
                    </p>

                    <p>
                      New here?{' '}
                      <button
                        type="button"
                        onClick={openSignup}
                        className="font-normal text-blue-600 transition hover:underline"
                      >
                        Sign up
                      </button>
                    </p>
                  </div>
                </div>
              ) : renderSignupBody()}
            </div>
          </CardContent>
        </Card>
      </div>
      <ForgotPasswordDialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen} defaultIdentifier={loginEmail} />
    </div>
  );
}
