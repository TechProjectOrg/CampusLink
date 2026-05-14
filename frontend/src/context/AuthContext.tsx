import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ApiUserProfile, Student } from '../types';
import {
  apiAuthenticateWithGoogle,
  apiCompleteGoogleOnboarding,
  apiDeleteAccount,
  apiFetchUserProfile,
  apiLogin,
  apiRequestStudentSignupOtp,
  apiSignupAlumni,
  apiVerifyStudentSignupOtp,
  type GoogleAuthResult,
  type AlumniPendingVerificationResult,
  type AlumniSignupPayload,
  type StudentSignupPayload,
  type StudentSignupOtpResponse,
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
  authenticateWithGoogle: (idToken: string) => Promise<GoogleAuthResult>;
  completeGoogleOnboarding: (payload: {
    sessionId: string;
    fullName?: string;
    username?: string;
    branch: string;
    year: string | number;
    accountType?: 'student';
  }) => Promise<void>;
  requestStudentSignupOtp: (payload: StudentSignupPayload) => Promise<StudentSignupOtpResponse>;
  verifyStudentSignupOtp: (verificationId: string, otp: string) => Promise<void>;
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
    avatar:
      profile.profilePictureUrl || undefined,
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
    const { profile: p, token } = await apiLogin(email, password);
    persistAndSet(p, token);
  };

  const authenticateWithGoogle = async (idToken: string) => {
    const result = await apiAuthenticateWithGoogle(idToken);
    if ('onboardingRequired' in result) {
      return result;
    }

    persistAndSet(result.profile, result.token);
    return result;
  };

  const completeGoogleOnboarding = async (payload: {
    sessionId: string;
    fullName?: string;
    username?: string;
    branch: string;
    year: string | number;
    accountType?: 'student';
  }) => {
    const { profile: p, token } = await apiCompleteGoogleOnboarding(payload);
    persistAndSet(p, token);
  };

  const requestStudentSignupOtp = async (payload: StudentSignupPayload) => {
    return await apiRequestStudentSignupOtp(payload);
  };

  const verifyStudentSignupOtp = async (verificationId: string, otp: string) => {
    const { profile: p, token } = await apiVerifyStudentSignupOtp(verificationId, otp);
    persistAndSet(p, token);
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
        const p = await apiFetchUserProfile(stored.userId, stored.token);
        if (handOffAdminSession(p, stored.token)) {
          return;
        }
        setProfile(p);
      } catch {
        // Session is invalid/expired or user no longer exists.
        clearStoredSession();
        setSession(null);
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const value: AuthContextValue = {
    isLoading,
    isAuthenticated,
    session,
    profile,
    currentUser,
    login,
    authenticateWithGoogle,
    completeGoogleOnboarding,
    requestStudentSignupOtp,
    verifyStudentSignupOtp,
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
