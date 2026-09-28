import { createClient } from '@supabase/supabase-js';

// Server-only client with full database access. Used ONLY by the Google Form
// import endpoint, which checks its own shared secret before doing anything.
// Never import this into a page or component.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
