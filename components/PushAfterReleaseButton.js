'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PushAfterReleaseButton({ roundId, applicantId, name, nextRoundName, pushed }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(on) {
    const msg = on
      ? `Push ${name} to ${nextRoundName || 'the next round'}? They'll be marked "Advanced (pushed through)."`
      : `Undo pushing ${name}? They'll be taken back out of ${nextRoundName || 'the next round'} and marked not advanced.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('push_after_release', { p_round: roundId, p_applicant: applicantId, p_on: on });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <span className="push-cell">
      {pushed ? (
        <button type="button" className="link-btn" onClick={() => run(false)} disabled={busy}>{busy ? '…' : 'Undo'}</button>
      ) : (
        <button type="button" className="btn btn-vouch push-btn" onClick={() => run(true)} disabled={busy}>
          {busy ? 'Pushing…' : `Push to ${nextRoundName || 'next round'}`}
        </button>
      )}
      {error && <span className="form-error push-error">{error}</span>}
    </span>
  );
}
