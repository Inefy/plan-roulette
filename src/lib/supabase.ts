// src/lib/supabase.ts
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

type SupabaseConfig = {
  anonKey: string;
  url: string;
};

function getSupabaseConfig(): SupabaseConfig {
  const resolvedAnonKey = supabaseAnonKey;
  const resolvedUrl = supabaseUrl;

  if (!resolvedUrl || !resolvedAnonKey) {
    const missingKeys = [
      !resolvedUrl ? 'EXPO_PUBLIC_SUPABASE_URL' : undefined,
      !resolvedAnonKey ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : undefined,
    ].filter((key): key is string => Boolean(key));

    throw new Error(
      [
        `Supabase development setup is missing: ${missingKeys.join(', ')}.`,
        'Create a local .env from .env.example and fill in the Expo public Supabase URL and anon key.',
        'Never use a Supabase service role key in the Expo client.',
      ].join(' '),
    );
  }

  return {
    anonKey: resolvedAnonKey,
    url: resolvedUrl,
  };
}

const supabaseConfig = getSupabaseConfig();

// Supabase anon keys are safe to ship only when every client-accessed table has strict RLS policies.
// Do not use service role keys here; service role keys must stay server-side only.
export const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
    storage: AsyncStorage,
  },
});
