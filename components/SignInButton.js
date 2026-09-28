'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SignInButton() {
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) setLoading(false);
  }

  return (
    <button className="btn btn-primary btn-wide" onClick={signIn} disabled={loading}>
      {loading ? 'Opening Google…' : 'Sign in with Google'}
    </button>
  );
}
