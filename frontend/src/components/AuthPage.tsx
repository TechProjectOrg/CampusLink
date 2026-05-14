import { useEffect, useState } from 'react';
import { Users, Mail, Lock, GraduationCap, Sparkles, TrendingUp, Award, Zap, Eye, EyeOff } from 'lucide-react';
import Lottie from 'lottie-react';
import loadingAnimation from '../assets/loading_animation.json';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader } from './ui/card';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { validatePassword, getPasswordValidationMessage } from '../lib/validation';
import { useAuth } from '../context/AuthContext';

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
          width: 320,
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

export function AuthPage() {
  const auth = useAuth();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupType, setSignupType] = useState<'student' | 'alumni'>('student');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [studentSignupData, setStudentSignupData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    branch: '',
    year: '',
    googleIdToken: '',
    verifiedGoogleEmail: '',
  });
  const [alumniSignupData, setAlumniSignupData] = useState({
    name: '',
    email: '',
    graduationYear: '',
    branch: '',
    currentStatus: '',
    password: '',
    confirmPassword: '',
    proofFiles: [] as File[],
  });
  const [signupError, setSignupError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [alumniPendingMessage, setAlumniPendingMessage] = useState('');
  const [passwordValidationMessages, setPasswordValidationMessages] = useState<string[]>([]);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showStudentConfirmPassword, setShowStudentConfirmPassword] = useState(false);
  const [showAlumniPassword, setShowAlumniPassword] = useState(false);
  const [showAlumniConfirmPassword, setShowAlumniConfirmPassword] = useState(false);

  const parseGoogleCredentialEmail = (credential: string): string | null => {
    try {
      const payload = credential.split('.')[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(window.atob(normalized));
      return typeof decoded.email === 'string' ? decoded.email.toLowerCase() : null;
    } catch {
      return null;
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setSignupError('');
    setAlumniPendingMessage('');
    setIsLoading(true);

    try {
      await auth.login(loginEmail, loginPassword);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAlumniSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    setLoginError('');
    setAlumniPendingMessage('');
    setIsLoading(true);

    if (alumniSignupData.password !== alumniSignupData.confirmPassword) {
      setSignupError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (!validatePassword(alumniSignupData.password)) {
      setSignupError('Password does not meet the requirements.');
      setIsLoading(false);
      return;
    }

    if (alumniSignupData.proofFiles.length === 0) {
      setSignupError('Please upload at least one alumni proof document.');
      setIsLoading(false);
      return;
    }

    try {
      const result = await auth.signupAlumni({
        name: alumniSignupData.name,
        email: alumniSignupData.email,
        password: alumniSignupData.password,
        graduationYear: alumniSignupData.graduationYear,
        branch: alumniSignupData.branch,
        currentStatus: alumniSignupData.currentStatus,
        proofFiles: alumniSignupData.proofFiles,
      });
      setAlumniPendingMessage(result.message);
      setActiveForm('login');
      setLoginEmail(alumniSignupData.email);
      setAlumniSignupData({
        name: '',
        email: '',
        graduationYear: '',
        branch: '',
        currentStatus: '',
        password: '',
        confirmPassword: '',
        proofFiles: [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      setSignupError(message);
      if (message.toLowerCase().includes('already exists')) {
        setActiveForm('login');
        setLoginEmail(alumniSignupData.email);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError('');
    setLoginError('');
    setAlumniPendingMessage('');
    setIsLoading(true);

    if (studentSignupData.password !== studentSignupData.confirmPassword) {
      setSignupError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (!validatePassword(studentSignupData.password)) {
      setSignupError('Password does not meet the requirements.');
      setIsLoading(false);
      return;
    }

    if (!studentSignupData.email.toLowerCase().endsWith('@gbpuat.ac.in')) {
      setSignupError('Students must use a college email (@gbpuat.ac.in)');
      setIsLoading(false);
      return;
    }

    if (!studentSignupData.googleIdToken) {
      setSignupError('Please verify your student email with Google before signing up.');
      setIsLoading(false);
      return;
    }

    if (
      studentSignupData.verifiedGoogleEmail &&
      studentSignupData.verifiedGoogleEmail !== studentSignupData.email.trim().toLowerCase()
    ) {
      setSignupError('The verified Google account must match the student email you entered.');
      setIsLoading(false);
      return;
    }

    try {
      await auth.signupStudent({
        name: studentSignupData.name,
        email: studentSignupData.email,
        password: studentSignupData.password,
        branch: studentSignupData.branch,
        year: studentSignupData.year,
        googleIdToken: studentSignupData.googleIdToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      setSignupError(message);
      if (message.toLowerCase().includes('already exists')) {
        setActiveForm('login');
        setLoginEmail(studentSignupData.email);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStudentGoogle = async (credential: string, mode: 'login' | 'signup') => {
    setSignupError('');
    setLoginError('');
    setAlumniPendingMessage('');

    if (mode === 'signup' && (!studentSignupData.branch || !studentSignupData.year || !studentSignupData.email)) {
      setSignupError('Name, college email, branch, and year are required before Google verification.');
      return;
    }

    if (mode === 'signup' && !studentSignupData.email.toLowerCase().endsWith('@gbpuat.ac.in')) {
      setSignupError('Students must use a college email (@gbpuat.ac.in)');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'signup') {
        const verifiedEmail = parseGoogleCredentialEmail(credential);
        if (verifiedEmail && verifiedEmail !== studentSignupData.email.trim().toLowerCase()) {
          setSignupError('Use the same Google account as the student email entered in the form.');
          return;
        }

        setStudentSignupData((current) => ({
          ...current,
          googleIdToken: credential,
          verifiedGoogleEmail: verifiedEmail ?? current.verifiedGoogleEmail,
        }));
      } else {
        await auth.loginStudentWithGoogle(credential);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed';
      if (mode === 'signup') {
        setSignupError(message);
      } else {
        setLoginError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (forgotPasswordEmail.endsWith('@gbpuat.ac.in')) {
      alert('Password reset link has been sent to your email!');
      setIsForgotPasswordOpen(false);
      setForgotPasswordEmail('');
    } else {
      alert('Please use your college email (@gbpuat.ac.in)');
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
            Join your college&apos;s professional network. Showcase your skills, discover opportunities,
            and connect with peers who share your passion.
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
            <p className="text-gray-600 text-center">Start building your professional network</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveForm('login')}
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
                  onClick={() => setActiveForm('signup')}
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
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-sm font-semibold text-slate-900">Students</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Sign in with your official `@gbpuat.ac.in` Google account.
                    </p>
                    <div className="mt-4">
                      <GoogleStudentButton
                        text="signin_with"
                        disabled={isLoading}
                        onCredential={(credential) => handleStudentGoogle(credential, 'login')}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span>Email / Password Login</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="your.email@example.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="pl-10 border-primary/20 focus:border-primary rounded-xl"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="login-password"
                          type={showLoginPassword ? 'text' : 'password'}
                          placeholder="Password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="pl-10 pr-10 border-primary/20 focus:border-primary rounded-xl"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword(!showLoginPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showLoginPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>

                    {loginError ? <p className="text-sm text-red-500">{loginError}</p> : null}
                    {alumniPendingMessage ? <p className="text-sm text-emerald-600">{alumniPendingMessage}</p> : null}

                      <Button type="submit" className="w-full gradient-primary shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105" disabled={isLoading}>
                        {isLoading ? <Lottie animationData={loadingAnimation} style={{ height: 50, width: 50 }} /> : 'Login to CampusLynk'}
                      </Button>

                    <div className="text-center">
                      <Dialog open={isForgotPasswordOpen} onOpenChange={setIsForgotPasswordOpen}>
                        <DialogTrigger className="text-sm text-secondary hover:text-primary transition-colors duration-300 hover:underline">
                          Forgot password?
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>Reset Password</DialogTitle>
                            <DialogDescription>
                              Enter your college email address and we&apos;ll send you a link to reset your password.
                            </DialogDescription>
                          </DialogHeader>
                          <form onSubmit={handleForgotPassword} className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <Label htmlFor="forgot-email">College Email</Label>
                              <div className="relative">
                                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <Input
                                  id="forgot-email"
                                  type="email"
                                  placeholder="your.name@gbpuat.ac.in"
                                  value={forgotPasswordEmail}
                                  onChange={(e) => setForgotPasswordEmail(e.target.value)}
                                  className="pl-10 border-primary/20 focus:border-primary rounded-xl"
                                  required
                                />
                              </div>
                            </div>
                            <div className="flex gap-3">
                              <Button type="button" variant="outline" onClick={() => setIsForgotPasswordOpen(false)} className="flex-1">
                                Cancel
                              </Button>
                              <Button type="submit" className="flex-1 gradient-primary">
                                Send Reset Link
                              </Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="animate-fade-slide-in">
                  <form onSubmit={signupType === 'student' ? handleStudentSignup : handleAlumniSignup} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-type">Sign up as</Label>
                      <select
                        id="signup-type"
                        value={signupType}
                        onChange={(e) => {
                          setSignupType(e.target.value as 'student' | 'alumni');
                          setSignupError('');
                        }}
                        className="w-full px-4 py-2 border border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <option value="student">Student</option>
                        <option value="alumni">Alumni</option>
                      </select>
                    </div>

                    {signupType === 'student' ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="student-name">Full Name</Label>
                          <Input
                            id="student-name"
                            type="text"
                            placeholder="Enter your full name"
                            value={studentSignupData.name}
                            onChange={(e) => setStudentSignupData((current) => ({ ...current, name: e.target.value }))}
                            className="border-primary/20 focus:border-primary rounded-xl"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="student-email">College Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="student-email"
                              type="email"
                              placeholder="your.name@gbpuat.ac.in"
                              value={studentSignupData.email}
                              onChange={(e) => setStudentSignupData((current) => ({
                                ...current,
                                email: e.target.value,
                                googleIdToken: '',
                                verifiedGoogleEmail: '',
                              }))}
                              className="pl-10 border-primary/20 focus:border-primary rounded-xl"
                              required
                            />
                          </div>
                          <p className="text-xs text-gray-500">Only college email is allowed for student accounts.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="signup-branch">Branch</Label>
                            <div className="relative">
                              <GraduationCap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                              <select
                                id="signup-branch"
                                value={studentSignupData.branch}
                                onChange={(e) => setStudentSignupData((current) => ({ ...current, branch: e.target.value }))}
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
                            <Label htmlFor="signup-year">Year</Label>
                            <select
                              id="signup-year"
                              value={studentSignupData.year}
                              onChange={(e) => setStudentSignupData((current) => ({ ...current, year: e.target.value }))}
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

                        <div className="space-y-2">
                          <Label htmlFor="student-password">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="student-password"
                              type={showStudentPassword ? 'text' : 'password'}
                              placeholder="Password"
                              value={studentSignupData.password}
                              onChange={(e) => {
                                const nextPassword = e.target.value;
                                setStudentSignupData((current) => ({ ...current, password: nextPassword }));
                                setPasswordValidationMessages(getPasswordValidationMessage(nextPassword));
                                setSignupError('');
                              }}
                              className="pl-10 pr-10 border-primary/20 focus:border-primary rounded-xl"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowStudentPassword(!showStudentPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showStudentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                          {passwordValidationMessages.length > 0 ? (
                            <ul className="text-xs text-red-500 list-disc list-inside">
                              {passwordValidationMessages.map((message) => <li key={message}>{message}</li>)}
                            </ul>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="student-confirm-password">Confirm Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="student-confirm-password"
                              type={showStudentConfirmPassword ? 'text' : 'password'}
                              placeholder="Confirm password"
                              value={studentSignupData.confirmPassword}
                              onChange={(e) => {
                                const nextConfirmPassword = e.target.value;
                                setStudentSignupData((current) => ({ ...current, confirmPassword: nextConfirmPassword }));
                                setSignupError(
                                  studentSignupData.password === nextConfirmPassword ? '' : 'Passwords do not match'
                                );
                              }}
                              className="pl-10 pr-10 border-primary/20 focus:border-primary rounded-xl"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowStudentConfirmPassword(!showStudentConfirmPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showStudentConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4">
                          <p className="text-sm font-semibold text-slate-900">Student verification uses Google</p>
                          <p className="mt-1 text-xs text-slate-600">
                            Verify that your college email exists by continuing with the same `@gbpuat.ac.in` Google account before creating the student account.
                          </p>
                          <div className="mt-4">
                            <GoogleStudentButton
                              text="signup_with"
                              disabled={isLoading}
                              onCredential={(credential) => handleStudentGoogle(credential, 'signup')}
                            />
                          </div>
                          <p className="mt-3 text-xs text-slate-600">
                            Verification status:{' '}
                            {studentSignupData.googleIdToken
                              ? `Verified with ${studentSignupData.verifiedGoogleEmail || 'your Google account'}`
                              : 'Not verified yet'}
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="alumni-name">Full Name</Label>
                          <Input
                            id="alumni-name"
                            type="text"
                            placeholder="Enter your full name"
                            value={alumniSignupData.name}
                            onChange={(e) => setAlumniSignupData((current) => ({ ...current, name: e.target.value }))}
                            className="border-primary/20 focus:border-primary rounded-xl"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="alumni-email">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="alumni-email"
                              type="email"
                              placeholder="you@example.com"
                              value={alumniSignupData.email}
                              onChange={(e) => setAlumniSignupData((current) => ({ ...current, email: e.target.value }))}
                              className="pl-10 border-primary/20 focus:border-primary rounded-xl"
                              required
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="alumni-graduation-year">Graduation Year</Label>
                            <Input
                              id="alumni-graduation-year"
                              type="number"
                              placeholder="2022"
                              value={alumniSignupData.graduationYear}
                              onChange={(e) => setAlumniSignupData((current) => ({ ...current, graduationYear: e.target.value }))}
                              className="border-primary/20 focus:border-primary rounded-xl"
                              required
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="alumni-branch">Branch</Label>
                            <div className="relative">
                              <GraduationCap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                              <select
                                id="alumni-branch"
                                value={alumniSignupData.branch}
                                onChange={(e) => setAlumniSignupData((current) => ({ ...current, branch: e.target.value }))}
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
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="alumni-current-status">Current working status</Label>
                          <Input
                            id="alumni-current-status"
                            type="text"
                            placeholder="Software Engineer at XYZ"
                            value={alumniSignupData.currentStatus}
                            onChange={(e) => setAlumniSignupData((current) => ({ ...current, currentStatus: e.target.value }))}
                            className="border-primary/20 focus:border-primary rounded-xl"
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="alumni-proof">Alumni proof</Label>
                          <Input
                            id="alumni-proof"
                            type="file"
                            accept=".pdf,image/png,image/jpeg,image/webp"
                            multiple
                            onChange={(e) => setAlumniSignupData((current) => ({
                              ...current,
                              proofFiles: Array.from(e.target.files ?? []),
                            }))}
                            className="border-primary/20 focus:border-primary rounded-xl"
                            required
                          />
                          <p className="text-xs text-gray-500">
                            Upload supporting proof such as an ID, certificate, or graduation document.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="alumni-password">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="alumni-password"
                              type={showAlumniPassword ? 'text' : 'password'}
                              placeholder="Password"
                              value={alumniSignupData.password}
                              onChange={(e) => {
                                const nextPassword = e.target.value;
                                setAlumniSignupData((current) => ({ ...current, password: nextPassword }));
                                setPasswordValidationMessages(getPasswordValidationMessage(nextPassword));
                                setSignupError('');
                              }}
                              className="pl-10 pr-10 border-primary/20 focus:border-primary rounded-xl"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowAlumniPassword(!showAlumniPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showAlumniPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                          {passwordValidationMessages.length > 0 ? (
                            <ul className="text-xs text-red-500 list-disc list-inside">
                              {passwordValidationMessages.map((message) => <li key={message}>{message}</li>)}
                            </ul>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="alumni-confirm-password">Confirm Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <Input
                              id="alumni-confirm-password"
                              type={showAlumniConfirmPassword ? 'text' : 'password'}
                              placeholder="Confirm password"
                              value={alumniSignupData.confirmPassword}
                              onChange={(e) => {
                                const nextConfirmPassword = e.target.value;
                                setAlumniSignupData((current) => ({ ...current, confirmPassword: nextConfirmPassword }));
                                setSignupError(
                                  alumniSignupData.password === nextConfirmPassword ? '' : 'Passwords do not match'
                                );
                              }}
                              className="pl-10 pr-10 border-primary/20 focus:border-primary rounded-xl"
                              required
                            />
                            <button
                              type="button"
                              onClick={() => setShowAlumniConfirmPassword(!showAlumniConfirmPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showAlumniConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {signupError ? <p className="text-sm text-red-500">{signupError}</p> : null}

                    <Button type="submit" className="w-full gradient-success shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105" disabled={isLoading}>
                      {isLoading
                        ? <Lottie animationData={loadingAnimation} style={{ height: 50, width: 50 }} />
                        : signupType === 'student'
                          ? 'Create Student Account'
                          : 'Submit Alumni Verification'}
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
