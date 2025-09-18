import { createClient } from '@supabase/supabase-js';

export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not set. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const fetchNoStore: typeof fetch = (input, init) => {
    const nextInit = { ...init, cache: 'no-store' as const };
    return fetch(input, nextInit);
  };

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    global: { fetch: fetchNoStore },
  });
}
