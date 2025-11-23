import { useState } from 'react';
import { Users, Mail, Lock, GraduationCap, Sparkles, TrendingUp, Award, Zap } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardHeader } from './ui/card';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

interface AuthPageProps {
  onLogin: () => void;
}

export function AuthPage({ onLogin }: AuthPageProps) {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [signupType, setSignupType] = useState<'student' | 'alumni'>('student');

  const [studentSignupData, setStudentSignupData] = useState({
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

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showStudentPassword, setShowStudentPassword] = useState(false);
  const [showStudentConfirmPassword, setShowStudentConfirmPassword] = useState(false);
  const [showAlumniPassword, setShowAlumniPassword] = useState(false);
  const [showAlumniConfirmPassword, setShowAlumniConfirmPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (loginEmail.endsWith('@gbpuat.ac.in')) {
      onLogin();
    } else {
      alert('Please use your college email (@gbpuat.ac.in)');
    }
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();

    const data = signupType === 'student' ? studentSignupData : alumniSignupData;

    if (data.password !== data.confirmPassword) {
      setSignupError('Passwords do not match');
      return;
    }

    setSignupError('');

    // For students, enforce college email; for alumni, allow any valid email
    if (signupType === 'student' && !data.email.endsWith('@gbpuat.ac.in')) {
      alert('Please use your college email (@gbpuat.ac.in)');
      return;
    }

    onLogin();
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
          <div className="inline-flex items-center gap-3 glass-morphism rounded-2xl p-4 shadow-2xl hover-lift">
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
            <div className="glass-morphism rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-white" />
                <p className="text-2xl text-white">500+</p>
              </div>
              <p className="text-sm text-white/80">Active Students</p>
            </div>
            <div className="glass-morphism rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '200ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-white" />
                <p className="text-2xl text-white">100+</p>
              </div>
              <p className="text-sm text-white/80">Opportunities</p>
            </div>
            <div className="glass-morphism rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '300ms' }}>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-white" />
                <p className="text-2xl text-white">50+</p>
              </div>
              <p className="text-sm text-white/80">Active Clubs</p>
            </div>
            <div className="glass-morphism rounded-2xl p-4 shadow-xl hover-lift animate-slide-in-up" style={{ animationDelay: '400ms' }}>
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
            <Tabs defaultValue="login" className="space-y-4">
              <TabsList className="grid w-full grid-cols-2 bg-gray-100 p-1 rounded-xl">
                <TabsTrigger value="login" className="rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300">
                  Login
                </TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg data-[state=active]:gradient-primary data-[state=active]:text-white transition-all duration-300">
                  Sign Up
                </TabsTrigger>
              </TabsList>

              {/* Login Form */}
              <TabsContent value="login" className="animate-fade-in">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">College Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 transition-colors duration-300" />
                      <Input
                        id="login-email"
                        type="email"
                        placeholder="your.name@gbpuat.ac.in"
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
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="pl-10 pr-16 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full gradient-primary shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                    Login to CampusLink
                  </Button>

                  <div className="text-center">
                    <a href="#" className="text-sm text-secondary hover:text-primary transition-colors duration-300 hover:underline">
                      Forgot password?
                    </a>
                  </div>
                </form>
              </TabsContent>

              {/* Signup Form */}
              <TabsContent value="signup" className="animate-fade-in">
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
                          value={studentSignupData.name}
                          onChange={(e) => setStudentSignupData({ ...studentSignupData, name: e.target.value })}
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
                            value={studentSignupData.email}
                            onChange={(e) => setStudentSignupData({ ...studentSignupData, email: e.target.value })}
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
                              value={studentSignupData.branch}
                              onChange={(e) => setStudentSignupData({ ...studentSignupData, branch: e.target.value })}
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
                            value={studentSignupData.year}
                            onChange={(e) => setStudentSignupData({ ...studentSignupData, year: e.target.value })}
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
                            value={studentSignupData.password}
                            onChange={(e) => {
                              setStudentSignupData({ ...studentSignupData, password: e.target.value });
                              setSignupError('');
                            }}
                            className="pl-10 pr-16 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="signup-confirm-password">Confirm Password</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <Input
                            id="signup-confirm-password"
                            type={showStudentConfirmPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={studentSignupData.confirmPassword}
                            onChange={(e) => {
                              setStudentSignupData({ ...studentSignupData, confirmPassword: e.target.value });
                              setSignupError('');
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
                              setAlumniSignupData({ ...alumniSignupData, password: e.target.value });
                              setSignupError('');
                            }}
                            className="pl-10 pr-16 border-primary/20 focus:border-primary rounded-xl transition-all duration-300"
                            required
                          />
                        </div>
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
                              setSignupError('');
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
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
