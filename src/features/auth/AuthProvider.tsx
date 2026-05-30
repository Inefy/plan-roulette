// src/features/auth/AuthProvider.tsx
import type { Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { trackAnalyticsEvent } from '../../lib/analytics';
import { supabase } from '../../lib/supabase';

export type AccountState = 'loading' | 'guest' | 'signed_in' | 'signed_out';

type AuthContextValue = {
  accountState: AccountState;
  errorMessage?: string;
  isGuest: boolean;
  isLoading: boolean;
  session: Session | null;
  signInAnonymously: (displayName?: string) => Promise<void>;
  signInWithEmail: (email: string, redirectTo?: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  user: User | null;
};

type AuthProviderProps = {
  children: ReactNode;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function getDisplayName(user: User, displayName?: string) {
  if (displayName?.trim()) {
    return displayName.trim();
  }

  if (user.email) {
    return user.email.split('@')[0];
  }

  return user.is_anonymous ? 'Guest planner' : 'Planner';
}

function getAccountState(isLoading: boolean, user: User | null): AccountState {
  if (isLoading) {
    return 'loading';
  }

  if (!user) {
    return 'signed_out';
  }

  return user.is_anonymous ? 'guest' : 'signed_in';
}

function getFirstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function ensureProfileForUser(user: User, displayName?: string) {
  const { error } = await supabase.rpc('ensure_profile', {
    p_display_name: getDisplayName(user, displayName),
  });

  if (error) {
    throw error;
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const handledAuthCodes = useRef(new Set<string>());
  const pendingUpgradeUserId = useRef<string | undefined>(undefined);

  const user = session?.user ?? null;
  const accountState = getAccountState(isLoading, user);
  const isGuest = accountState === 'guest';

  const applySession = useCallback(async (nextSession: Session | null, displayName?: string) => {
    setSession(nextSession);

    if (nextSession?.user) {
      await ensureProfileForUser(nextSession.user, displayName);
    }
  }, []);

  const handleAuthRedirectUrl = useCallback(
    async (url: string | null) => {
      if (!url) {
        return;
      }

      const parsedUrl = Linking.parse(url);
      const code = getFirstQueryValue(parsedUrl.queryParams?.code);

      if (!code || handledAuthCodes.current.has(code)) {
        return;
      }

      handledAuthCodes.current.add(code);
      setIsLoading(true);
      setErrorMessage(undefined);

      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          throw error;
        }

        await applySession(data.session);
      } catch (authError) {
        if (authError instanceof Error) {
          setErrorMessage(authError.message);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [applySession],
  );

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      setIsLoading(true);
      setErrorMessage(undefined);

      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      try {
        await applySession(data.session);
      } catch (profileError) {
        if (profileError instanceof Error) {
          setErrorMessage(profileError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    async function bootstrapSession() {
      const initialUrl = await Linking.getInitialURL().catch(() => null);

      await handleAuthRedirectUrl(initialUrl);

      if (isMounted) {
        await loadSession();
      }
    }

    void bootstrapSession();

    const urlSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthRedirectUrl(url);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (
        (event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
        nextSession?.user &&
        !nextSession.user.is_anonymous &&
        pendingUpgradeUserId.current === nextSession.user.id
      ) {
        trackAnalyticsEvent({
          name: 'account_upgrade_completed',
          properties: {
            accountState: 'signed_in',
          },
        });
        pendingUpgradeUserId.current = undefined;
      }

      if (nextSession?.user) {
        setTimeout(() => {
          ensureProfileForUser(nextSession.user).catch((profileError: unknown) => {
            if (profileError instanceof Error) {
              setErrorMessage(profileError.message);
            }
          });
        }, 0);
      }
    });

    return () => {
      isMounted = false;
      urlSubscription.remove();
      subscription.unsubscribe();
    };
  }, [applySession, handleAuthRedirectUrl]);

  const signInAnonymously = useCallback(
    async (displayName?: string) => {
      setIsLoading(true);
      setErrorMessage(undefined);

      const { data, error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            display_name: displayName?.trim() || 'Guest planner',
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      try {
        await applySession(data.session, displayName);
      } catch (profileError) {
        if (profileError instanceof Error) {
          setErrorMessage(profileError.message);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [applySession],
  );

  const signInWithEmail = useCallback(
    async (email: string, redirectTo?: string) => {
      const trimmedEmail = email.trim();

      if (!trimmedEmail) {
        setErrorMessage('Enter an email address to send a magic link.');
        return false;
      }

      setIsLoading(true);
      setErrorMessage(undefined);

      if (session?.user?.is_anonymous) {
        pendingUpgradeUserId.current = session.user.id;
        trackAnalyticsEvent({
          name: 'account_upgrade_started',
          properties: {
            accountState: 'guest',
          },
        });

        const { error } = await supabase.auth.updateUser(
          {
            email: trimmedEmail,
          },
          redirectTo
            ? {
                emailRedirectTo: redirectTo,
              }
            : undefined,
        );

        if (error) {
          pendingUpgradeUserId.current = undefined;
          setErrorMessage(error.message);
          setIsLoading(false);
          return false;
        }

        setIsLoading(false);
        return true;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmedEmail,
        options: {
          ...(redirectTo ? { emailRedirectTo: redirectTo } : {}),
          shouldCreateUser: true,
        },
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return false;
      }

      setIsLoading(false);
      return true;
    },
    [session],
  );

  const signOut = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(undefined);

    const { error } = await supabase.auth.signOut();

    if (error) {
      setErrorMessage(error.message);
    } else {
      setSession(null);
    }

    setIsLoading(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      accountState,
      errorMessage,
      isGuest,
      isLoading,
      session,
      signInAnonymously,
      signInWithEmail,
      signOut,
      user,
    }),
    [accountState, errorMessage, isGuest, isLoading, session, signInAnonymously, signInWithEmail, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
}
