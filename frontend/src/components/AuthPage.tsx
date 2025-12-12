import { useState, useMemo } from 'react';
import { Users, Mail, Lock, GraduationCap, Sparkles, TrendingUp, Award, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader } from './ui/card';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { validatePassword, getPasswordValidationMessage } from '../lib/validation';

const API_BASE = 'http://localhost:4000';

interface AuthPageProps {
  onLogin: () => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupType, setSignupType] = useState<'student' | 'alumni'>('student');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [activeForm, setActiveForm] = useState<'login' | 'signup'>('login');
  const [signupData, setSignupData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    branch: '',
    year: ''
  });

  const [alumniSignupData, setAlumniSignupData] = useState({
    name: '',
    email: '',
    graduationYear: '',
    branch: '',
    currentStatus: '',
    password: '',
    confirmPassword: ''
  });

  const [signupError, setSignupError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [passwordValidationMessages, setPasswordValidationMessages] = useState<string[]>([]);

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showStudentConfirmPassword, setShowStudentConfirmPassword] = useState(false);
  const [showAlumniPassword, setShowAlumniPassword] = useState(false);
  const [showAlumniConfirmPassword, setShowAlumniConfirmPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: loginEmail,
          password: loginPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setLoginError(errorData.message || 'Invalid email or password');
        return;
      }

      // const user = await response.json();
      // TODO: store user/token if needed
      onLogin();
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Unable to connect to the server. Please try again.');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = signupType === 'student' ? signupData : alumniSignupData;

    if (data.password !== data.confirmPassword) {
      setSignupError('Passwords do not match');
      return;
    }

    if (!validatePassword(data.password)) {
      setSignupError('Password does not meet the requirements.');
      return;
    }

    setSignupError('');
    setLoginError('');

    // For students, enforce college email; for alumni, allow any valid email
    if (signupType === 'student' && !data.email.endsWith('@gbpuat.ac.in')) {
      alert('Please use your college email (@gbpuat.ac.in)');
      return;
    }

    try {
      const endpoint =
        signupType === 'student' ? '/auth/signup/student' : '/auth/signup/alumni';

      const payload =
        signupType === 'student'
          ? {
              name: signupData.name,
              email: signupData.email,
              password: signupData.password,
              branch: signupData.branch,
              year: signupData.year,
            }
          : {
              name: alumniSignupData.name,
              email: alumniSignupData.email,
              password: alumniSignupData.password,
              graduationYear: alumniSignupData.graduationYear,
              branch: alumniSignupData.branch,
              currentStatus: alumniSignupData.currentStatus,
            };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 409) {
        const errorData = await response.json().catch(() => ({}));
        setSignupError(errorData.message || 'User already exists. Please sign in instead.');
        // Switch to login and pre-fill email for convenience
        setActiveForm('login');
        setLoginEmail(data.email);
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        setSignupError(errorData.message || 'Signup failed. Please try again.');
        return;
      }

      // const user = await response.json();
      // TODO: store user/token if needed
      onLogin();
    } catch (error) {
      console.error('Signup error:', error);
      setSignupError('Unable to connect to the server. Please try again.');
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
    <div className="min-h-screen bg-gradient-to-br from-primary via-secondary to-purple-600 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>

      <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center relative z-10">
        {/* Left Side - Branding */}
        <div className="space-y-6 text-center md:text-left animate-slide-in-up">
          <div className="inline-flex items-center gap-3 glass-morphism-solid rounded-2xl p-4 shadow-2xl hover-lift">
            <div className="gradient-primary text-white rounded-xl p-3 shadow-lg">
              <Users className="w-8 h-8" />
            </div>
            <span className="text-white text-2xl">CampusLink</span>
          </div>
          
          <h1 className="text-white text-3xl md:text-4xl animate-slide-in-down">
            Connect. Collaborate. Succeed.
          </h1>
          
          <p className="text-white/90 text-lg">
            Join your college's professional network. Showcase your skills, discover opportunities, 
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

        {/* Right Side - Auth Forms */}
        <Card className="shadow-2xl border-0 backdrop-blur-lg bg-white/95 animate-slide-in-up">
          <CardHeader>
            <div className="flex items-center justify-center gap-2 mb-2">
              <Zap className="w-6 h-6 text-primary" />
              <h2 className="text-gray-900 text-center bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Welcome to CampusLink
              </h2>
            </div>
            <p className="text-gray-600 text-center">Start building your professional network</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Form Toggle Buttons */}
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

              {/* Login Form */}
              {activeForm === 'login' && (
                <div className="animate-fade-slide-in">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors duration-300" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="your.email@example.com"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="pl-10 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors duration-300" />
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="pl-10 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                          required
                        />
                      </div>
                    </div>

                    {loginError && (
                      <p className="text-sm text-red-500">{loginError}</p>
                    )}

                    <Button type="submit" className="w-full gradient-primary shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                      Login to CampusLink
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
                              Enter your college email address and we'll send you a link to reset your password.
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
                              <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => setIsForgotPasswordOpen(false)}
                                className="flex-1"
                              >
                                Cancel
                              </Button>
                              <Button 
                                type="submit" 
                                className="flex-1 gradient-primary"
                              >
                                Send Reset Link
                              </Button>
                            </div>
                          </form>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </form>
                </div>
              )}

              {/* Signup Form */}
              {activeForm === 'signup' && (
                <div className="animate-fade-slide-in">
                  <form onSubmit={handleSignup} className="space-y-4">
                      {/* Signup type selector */}
                    <div className="space-y-2">
                      <Label htmlFor="signup-type">Sign up as</Label>
                      <select
                        id="signup-type"
                        value={signupType}
                        onChange={(e) => setSignupType(e.target.value as 'student' | 'alumni')}
                        className="w-full px-4 py-2 border border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-300"
                      >
                        <option value="student">Student</option>
                        <option value="alumni">Alumni</option>
                      </select>
                    </div>

                    {signupType === 'student' ? (
                      <>
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Full Name</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder="John Doe"
                        value={signupData.name}
                        onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                        className="border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-email">College Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="signup-email"
                          type="email"
                          placeholder="your.name@gbpuat.ac.in"
                          value={signupData.email}
                          onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                          className="pl-10 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                          required
                        />
                      </div>
                      <p className="text-xs text-gray-500">Use your official college email</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="signup-branch">Branch</Label>
                        <div className="relative">
                          <GraduationCap className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 z-10" />
                          <select
                            id="signup-branch"
                            value={signupData.branch}
                            onChange={(e) => setSignupData({ ...signupData, branch: e.target.value })}
                            className="w-full pl-10 pr-4 py-2 border border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-300"
                            required
                          >
                            <option value="">Select</option>
                            <option value="Computer Science">Computer Science</option>
                            <option value="Information Technology">Information Technology</option>
                            <option value="Electronics">Electronics</option>
                            <option value="Mechanical">Mechanical</option>
                            <option value="Civil">Civil</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-year">Year</Label>
                        <select
                          id="signup-year"
                          value={signupData.year}
                          onChange={(e) => setSignupData({ ...signupData, year: e.target.value })}
                          className="w-full px-4 py-2 border border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-300"
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
                      <Label htmlFor="signup-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <Input
                          id="signup-password"
                          type={showStudentPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={signupData.password}
                          onChange={(e) => {
                            const newPassword = e.target.value;
                            setSignupData({ ...signupData, password: newPassword });
                            setPasswordValidationMessages(getPasswordValidationMessage(newPassword));
                            setSignupError('');
                          }}
                          className="pl-10 pr-16 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                          required
                        />
                      </div>
                      {passwordValidationMessages.length > 0 && (
                        <ul className="text-xs text-red-500 list-disc list-inside">
                          {passwordValidationMessages.map((msg) => <li key={msg}>{msg}</li>)}
                        </ul>
                      )}
                    </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            id="signup-confirm-password"
                            type={showStudentConfirmPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={signupData.confirmPassword}
                            onChange={(e) => {
                              setSignupData({ ...signupData, confirmPassword: e.target.value });
                              if (signupData.password === e.target.value) {
                                setSignupError('');
                              } else {
                                setSignupError('Passwords do not match');
                              }
                            }}
                            className="pl-10 pr-16 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                            required
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="alumni-name">Full Name</Label>
                        <Input
                          id="alumni-name"
                          type="text"
                          placeholder="John Doe"
                          value={alumniSignupData.name}
                          onChange={(e) => setAlumniSignupData({ ...alumniSignupData, name: e.target.value })}
                          className="border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
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
                            onChange={(e) => setAlumniSignupData({ ...alumniSignupData, email: e.target.value })}
                            className="pl-10 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
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
                            onChange={(e) => setAlumniSignupData({ ...alumniSignupData, graduationYear: e.target.value })}
                            className="border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
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
                              onChange={(e) => setAlumniSignupData({ ...alumniSignupData, branch: e.target.value })}
                              className="w-full pl-10 pr-4 py-2 border border-primary/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all duration-300"
                              required
                            >
                              <option value="">Select</option>
                              <option value="Computer Science">Computer Science</option>
                              <option value="Information Technology">Information Technology</option>
                              <option value="Electronics">Electronics</option>
                              <option value="Mechanical">Mechanical</option>
                              <option value="Civil">Civil</option>
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
                          onChange={(e) => setAlumniSignupData({ ...alumniSignupData, currentStatus: e.target.value })}
                          className="border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="alumni-password">Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            id="alumni-password"
                            type={showAlumniPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={alumniSignupData.password}
                            onChange={(e) => {
                              const newPassword = e.target.value;
                              setAlumniSignupData({ ...alumniSignupData, password: newPassword });
                              setPasswordValidationMessages(getPasswordValidationMessage(newPassword));
                              setSignupError('');
                            }}
                            className="pl-10 pr-16 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                            required
                          />
                        </div>
                        {passwordValidationMessages.length > 0 && (
                            <ul className="text-xs text-red-500 list-disc list-inside">
                                {passwordValidationMessages.map((msg) => <li key={msg}>{msg}</li>)}
                            </ul>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="alumni-confirm-password">Confirm Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            id="alumni-confirm-password"
                            type={showAlumniConfirmPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={alumniSignupData.confirmPassword}
                            onChange={(e) => {
                              setAlumniSignupData({ ...alumniSignupData, confirmPassword: e.target.value });
                              if (alumniSignupData.password === e.target.value) {
                                  setSignupError('');
                              } else {
                                  setSignupError('Passwords do not match');
                              }
                            }}
                            className="pl-10 pr-16 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                            required
                          />
                        
                        </div>
                      </div>
                    </>
                  )}

                  {signupError && (
                    <p className="text-sm text-red-500">{signupError}</p>
                  )}

                    <Button type="submit" className="w-full gradient-success shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                      Create Account
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