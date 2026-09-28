'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ConflictButton({ applicantId, firstName, hasConflict }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function flag() {
    const ok = window.confirm(
      `Flag a conflict of interest with ${firstName}?\n\nYou'll be removed as their reviewer (your scores and notes on them are cleared), they'll be handed to another reviewer, and you'll sit out their deliberation vote.`
    );
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('declare_conflict', { p_applicant: applicantId });
    setBusy(false);
    if (error) return setMessage({ kind: 'error', text: 'Couldn’t flag the conflict. Try again.' });
    const text = data?.unfilled
      ? 'Conflict flagged. No other reviewer was free, so an admin has been flagged to reassign them.'
      : data?.reassigned
        ? 'Conflict flagged. They’ve been handed to another reviewer.'
        : 'Conflict flagged.';
    setMessage({ kind: 'ok', text });
    router.refresh();
  }

  async function unflag() {
    setBusy(true);
    const { error } = await supabase.rpc('remove_conflict', { p_applicant: applicantId });
    setBusy(false);
    if (error) return setMessage({ kind: 'error', text: 'Couldn’t remove the flag. Try again.' });
    setMessage(null);
    router.refresh();
  }

  return (
    <section className="conflict" aria-label="Conflict of interest">
      {hasConflict ? (
        <>
          <p className="conflict-on">You flagged a conflict with {firstName}</p>
          <p className="muted conflict-sub">You won&apos;t be assigned to review them and you&apos;ll sit out their vote.</p>
          <button type="button" className="link-btn" onClick={unflag} disabled={busy}>Remove flag</button>
        </>
      ) : (
        <button type="button" className="link-btn link-btn-quiet" onClick={flag} disabled={busy}>
          I have a conflict with this applicant
        </button>
      )}
      {message && (
        <p className={message.kind === 'error' ? 'form-error' : 'form-ok'} role="status">{message.text}</p>
      )}
    </section>
  );
}
