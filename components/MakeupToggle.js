'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function MakeupToggle({ roundId, applicantId, firstName, on, decided, released }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function toggle() {
    const next = !on;
    const msg = next
      ? `Mark ${firstName} as a makeup coffee chat?\n\nThey're held out of the Coffee Chats vote and cutoff (any votes already cast on them are removed), stay gradable on My table after scoring closes, and are decided separately on the round page.`
      : `Remove ${firstName}'s makeup status? They'll be part of the normal vote and cutoff again.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc('set_makeup', { p_round: roundId, p_applicant: applicantId, p_on: next });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <div className="makeup-box">
      {on ? (
        <>
          <span className="makeup-pill">Makeup coffee chat</span>
          <span className="muted">
            {decided ? 'Decided on the Coffee Chats round page.' : released ? 'Decide them on the Coffee Chats round page.' : 'Held out of the vote; decided separately.'}
          </span>
          {!released && !decided && (
            <button type="button" className="link-btn" onClick={toggle} disabled={busy}>Undo</button>
          )}
        </>
      ) : (
        <button type="button" className="btn btn-quiet" onClick={toggle} disabled={busy}>
          {busy ? 'Saving…' : 'Mark as makeup coffee chat'}
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
