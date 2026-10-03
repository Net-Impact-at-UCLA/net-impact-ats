'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Admin toggle: advance a hard-vouched applicant regardless of the cutoff.
export default function AdvanceByVouchButton({ roundId, applicantId, firstName, initialOn, large = false }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setOn(initialOn), [initialOn]);

  async function toggle() {
    const next = !on;
    if (next && !window.confirm(`Advance ${firstName} by hard vouch? They'll move on regardless of the cutoff.`)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('set_advance_override', { p_round: roundId, p_applicant: applicantId, p_on: next });
    setBusy(false);
    if (error) return setError('Couldn’t update. Is voting still open or at the cutoff?');
    setOn(next);
    router.refresh();
  }

  return (
    <div className={`advance-vouch ${on ? 'advance-vouch-on' : ''} ${large ? 'advance-vouch-lg' : ''}`}>
      {on ? (
        <>
          <span className="advance-vouch-state">✓ Advancing by hard vouch</span>
          <button type="button" className="link-btn" onClick={toggle} disabled={busy}>Undo</button>
        </>
      ) : (
        <button type="button" className="btn btn-vouch" onClick={toggle} disabled={busy}>
          {busy ? 'Saving…' : 'Advance by hard vouch'}
        </button>
      )}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
