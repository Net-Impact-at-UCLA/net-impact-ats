'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ReopenCutoffButton({ roundId, roundName, nextRoundName, label = 'cut line' }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function reopen() {
    const ok = window.confirm(
      `Reopen the ${label} for ${roundName}?\n\nEveryone who advanced is taken back out of ${nextRoundName || 'the next round'}, everyone marked not advanced becomes active again, and anyone pushed through stays pushed through. You can then move the line and apply it again.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('reopen_cutoff', { p_round: roundId });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <>
      <button type="button" className="btn btn-quiet" onClick={reopen} disabled={busy}>
        {busy ? 'Reopening…' : `Reopen ${label}`}
      </button>
      {error && <p className="form-error reopen-error" role="alert">{error}</p>}
    </>
  );
}
