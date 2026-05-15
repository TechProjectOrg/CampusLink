import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ApiUserProfile, Student } from '../types';
import {
  apiAuthenticateWithGoogle,
  apiCompleteGoogleOnboarding,
  apiCompleteMagicLinkOnboarding,
  apiDeleteAccount,
  apiExchangeSignupVerification,
  apiFetchUserProfile,
  apiLogin,
  apiSendSignupVerificationLink,
  apiSignupAlumni,
  type AlumniPendingVerificationResult,
  type AlumniSignupPayload,
  type AuthOnboardingResponse,
  type GoogleAuthResult,
  type StudentSignupPayload,
  type SignupExchangeResult,
} from '../lib/authApi';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
  type StoredAuthSession,
} from '../lib/authStorage';
import { clearAdminSession, readAdminSession, writeAdminSession } from '../admin/session';

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  session: StoredAuthSession | null;
  profile: ApiUserProfile | null;
  currentUser: Student | null;

  login: (email: string, password: string) => Promise<void>;
  authenticateWithGoogle: (payload: {
    idToken: string;
    intent?: 'login' | 'signup';
    accountType?: 'student' | 'alumni';
  }) => Promise<GoogleAuthResult>;
  sendSignupVerificationLink: (email: string, accountType: 'student' | 'alumni') => Promise<{ message: string }>;
  exchangeSignupVerification: (exchangeCode: string) => Promise<SignupExchangeResult>;
  completeStudentSignup: (payload: StudentSignupPayload) => Promise<void>;
  completeGoogleOnboarding: (payload: StudentSignupPayload) => Promise<void>;
  completeMagicLinkOnboarding: (payload: StudentSignupPayload) => Promise<void>;
  signupAlumni: (payload: AlumniSignupPayload) => Promise<AlumniPendingVerificationResult>;
  refreshProfile: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function profileToStudent(profile: ApiUserProfile): Student {
  return {
    id: profile.userId,
    name: profile.username,
    username: profile.username,
    email: profile.email,
    branch: profile.details?.branch ?? 'Unknown',
    year: profile.details?.year ?? profile.details?.passingYear ?? 0,
    avatar: profile.profilePictureUrl || undefined,
    coverPhotoUrl: profile.coverPhotoUrl || undefined,
    bio: profile.bio ?? '',
    skills: [],
    interests: [],
    certifications: [],
    projects: [],
    accountType: profile.isPublic ? 'public' : 'private',
  };
}

function handOffAdminSession(profile: ApiUserProfile, token?: string): boolean {
  if (!profile.adminAccess || !token) return false;

  clearStoredSession();
  writeAdminSession({ token });
  window.location.replace('/admin');
  return true;
}

function isOnboardingResult(result: GoogleAuthResult | SignupExchangeResult): result is AuthOnboardingResponse {
  return 'onboardingRequired' in result;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<StoredAuthSession | null>(null);
  const [profile, setProfile] = useState<ApiUserProfile | null>(null);

  const isAuthenticated = !!session && !!profile;

  const currentUser = useMemo(() => {
    return profile ? profileToStudent(profile) : null;
  }, [profile]);

  const persistAndSet = (nextProfile: ApiUserProfile, token?: string) => {
    if (handOffAdminSession(nextProfile, token)) {
      return;
    }

    const nextSession: StoredAuthSession = {
      userId: nextProfile.userId,
      token,
    };

    writeStoredSession(nextSession);
    setSession(nextSession);
    setProfile(nextProfile);
  };

  const logout = () => {
    clearStoredSession();
    clearAdminSession();
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!session) return;

    const latest = await apiFetchUserProfile(session.userId, session.token);
    setProfile(latest);
  };

  const deleteAccount = async (password: string) => {
    if (!session) {
      throw new Error('Not authenticated');
    }

    await apiDeleteAccount(session.userId, password, session.token);
    logout();
  };

  const login = async (email: string, password: string) => {
    const { profile: nextProfile, token } = await apiLogin(email, password);
    persistAndSet(nextProfile, token);
  };

  const authenticateWithGoogle = async (payload: {
    idToken: string;
    intent?: 'login' | 'signup';
    accountType?: 'student' | 'alumni';
  }) => {
    const result = await apiAuthenticateWithGoogle(payload);
    if (isOnboardingResult(result)) {
      return result;
    }

    persistAndSet(result.profile, result.token);
    return result;
  };

  const sendSignupVerificationLink = async (email: string, accountType: 'student' | 'alumni') => {
    return await apiSendSignupVerificationLink(email, accountType);
  };

  const exchangeSignupVerification = async (exchangeCode: string) => {
    return await apiExchangeSignupVerification(exchangeCode);
  };

  const completeStudentSignup = async (payload: StudentSignupPayload) => {
    const { profile: nextProfile, token } = await apiCompleteMagicLinkOnboarding(payload);
    persistAndSet(nextProfile, token);
  };

  const completeGoogleOnboarding = async (payload: StudentSignupPayload) => {
    const { profile: nextProfile, token } = await apiCompleteGoogleOnboarding(payload);
    persistAndSet(nextProfile, token);
  };

  const completeMagicLinkOnboarding = async (payload: StudentSignupPayload) => {
    const { profile: nextProfile, token } = await apiCompleteMagicLinkOnboarding(payload);
    persistAndSet(nextProfile, token);
  };

  const signupAlumni = async (payload: AlumniSignupPayload) => {
    return await apiSignupAlumni(payload);
  };

  useEffect(() => {
    const init = async () => {
      const stored = readStoredSession();
      if (!stored) {
        const storedAdminSession = readAdminSession();
        if (storedAdminSession) {
          window.location.replace('/admin');
          return;
        }
        setIsLoading(false);
        return;
      }

      setSession(stored);

      try {
        const nextProfile = await apiFetchUserProfile(stored.userId, stored.token);
        if (handOffAdminSession(nextProfile, stored.token)) {
          return;
        }
        setProfile(nextProfile);
      } catch {
        clearStoredSession();
        setSession(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    void init();
  }, []);

  const value: AuthContextValue = {
    isLoading,
    isAuthenticated,
    session,
    profile,
    currentUser,
    login,
    authenticateWithGoogle,
    sendSignupVerificationLink,
    exchangeSignupVerification,
    completeStudentSignup,
    completeGoogleOnboarding,
    completeMagicLinkOnboarding,
    signupAlumni,
    refreshProfile,
    deleteAccount,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
