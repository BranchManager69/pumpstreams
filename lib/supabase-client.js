import { createClient } from '@supabase/supabase-js';
import { optionalEnv } from './env.js';

const SUPABASE_URL = optionalEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = optionalEnv('SUPABASE_SERVICE_ROLE_KEY');

let supabaseClient = null;

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: {
      headers: {
        'x-client-info': 'pumpstreams-cli',
      },
    },
  });
} else {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set; skipping Supabase integration.');
}

export function getSupabase() {
  if (!supabaseClient) {
    throw new Error('Supabase client not initialised. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }
  return supabaseClient;
}

export function hasSupabase() {
  return Boolean(supabaseClient);
}

export function getSupabaseAnonKey() {
  return optionalEnv('SUPABASE_ANON_KEY');
}
