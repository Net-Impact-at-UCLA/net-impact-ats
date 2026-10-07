'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Released Coffee Chats results: move someone into the makeup pile, or back out of it.
export default function MoveToMakeupButton({ roundId, applicantId, name, back = false }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run() {
    const msg = back
      ? `Return ${name} to the main results? They'll be decided by the applied cutoff, using the votes already cast.`
      : `Move ${name} to makeups?\n\nThey become undecided (taken back out of the next round if they'd advanced), can be graded on My table after their makeup, and are decided in the makeups section on this page.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc(back ? 'return_from_makeup' : 'move_to_makeup', { p_round: roundId, p_applicant: applicantId });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <span className="push-cell">
      <button type="button" className={back ? 'link-btn' : 'btn btn-makeup push-btn'} onClick={run} disabled={busy}>
        {busy ? '…' : back ? 'Return to results' : 'Move to makeups'}
      </button>
      {error && <span className="form-error push-error">{error}</span>}
    </span>
  );
}
