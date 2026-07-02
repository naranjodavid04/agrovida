import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';

import { getEnv } from '@/lib/env';

/**
 * Supabase client with a persisted session (ARCHITECTURE §7). The session is
 * stored in expo-sqlite's key/value store, so it survives offline restarts.
 * Domain screens never call this client directly — only auth, bootstrap, and
 * the sync engine do.
 */

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: {
      storage: Storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
