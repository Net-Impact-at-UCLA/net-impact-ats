import { createClient } from '@/lib/supabase/server';

// Returns the signed-in user and their roster entry (null if not on the roster).
export async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, user: null, member: null };

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('email', (user.email || '').toLowerCase())
    .eq('is_active', true)
    .maybeSingle();

  return { supabase, user, member };
}

export async function getActiveCycle(supabase) {
  const { data } = await supabase
    .from('cycles')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle();
  return data;
}

// Turns storage paths into temporary links (1 hour). Returns { path: url }.
export async function signedUrls(supabase, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data } = await supabase.storage
    .from('applicant-files')
    .createSignedUrls(unique, 3600);
  const map = {};
  (data || []).forEach((d) => {
    if (d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}
