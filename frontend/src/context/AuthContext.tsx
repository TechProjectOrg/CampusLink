import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ApiUserProfile, Student } from '../types';
import {
  apiFetchUserProfile,
  apiLogin,
  apiSignupAlumni,
  apiSignupStudent,
  type AlumniSignupPayload,
  type StudentSignupPayload,
} from '../lib/authApi';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
  type StoredAuthSession,
} from '../lib/authStorage';

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  session: StoredAuthSession | null;
  profile: ApiUserProfile | null;
  currentUser: Student | null;

  login: (email: string, password: string) => Promise<void>;
  signupStudent: (payload: StudentSignupPayload) => Promise<void>;
  signupAlumni: (payload: AlumniSignupPayload) => Promise<void>;
  refreshProfile: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function profileToStudent(profile: ApiUserProfile): Student {
  const seed = encodeURIComponent(profile.username || profile.email || profile.userId);

  return {
    id: profile.userId,
    name: profile.username,
    email: profile.email,
    branch: profile.details?.branch ?? 'Unknown',
    year: profile.details?.year ?? profile.details?.passingYear ?? 0,
    avatar:
      profile.profilePictureUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`,
    bio: profile.bio ?? '',
    skills: [],
    interests: [],
    certifications: [],
    projects: [],
    connections: [],
    pendingRequests: [],
  };
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
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (!session) return;

    const latest = await apiFetchUserProfile(session.userId, session.token);
    setProfile(latest);
  };

  const login = async (email: string, password: string) => {
    const { profile: p, token } = await apiLogin(email, password);
    persistAndSet(p, token);
  };

  const signupStudent = async (payload: StudentSignupPayload) => {
    const { profile: p, token } = await apiSignupStudent(payload);
    persistAndSet(p, token);
  };

  const signupAlumni = async (payload: AlumniSignupPayload) => {
    const { profile: p, token } = await apiSignupAlumni(payload);
    persistAndSet(p, token);
  };

  useEffect(() => {
    const init = async () => {
      const stored = readStoredSession();
      if (!stored) {
        setIsLoading(false);
        return;
      }

      setSession(stored);

      try {
        const p = await apiFetchUserProfile(stored.userId, stored.token);
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
    signupStudent,
    signupAlumni,
    refreshProfile,
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
