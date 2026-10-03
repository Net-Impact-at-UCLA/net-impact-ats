'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// After results: push a not-advanced applicant through, cut an advanced one, or undo either.
// state: 'advanced' | 'pushed' | 'out' | 'cut'
export default function PushAfterReleaseButton({ roundId, applicantId, name, nextRoundName, state }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const next = nextRoundName || 'the next round';

  const actions = {
    out: { fn: 'push_after_release', on: true, label: `Push to ${nextRoundName || 'next round'}`, cls: 'btn btn-vouch push-btn', confirm: `Push ${name} to ${next}? They'll be marked "Advanced (pushed through)."` },
    pushed: { fn: 'push_after_release', on: false, label: 'Undo push', cls: 'link-btn', confirm: `Undo pushing ${name}? They'll be taken back out of ${next} and marked not advanced.` },
    advanced: { fn: 'cut_after_release', on: true, label: 'Cut', cls: 'btn btn-danger-quiet push-btn', confirm: `Cut ${name}? They'll be taken out of ${next} and marked "Not advanced (cut)."` },
    cut: { fn: 'cut_after_release', on: false, label: 'Undo cut', cls: 'link-btn', confirm: `Restore ${name}? They'll go back into ${next} as advanced.` },
  };
  const a = actions[state];
  if (!a) return null;

  async function run() {
    if (!window.confirm(a.confirm)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc(a.fn, { p_round: roundId, p_applicant: applicantId, p_on: a.on });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <span className="push-cell">
      <button type="button" className={a.cls} onClick={run} disabled={busy}>{busy ? '…' : a.label}</button>
      {error && <span className="form-error push-error">{error}</span>}
    </span>
  );
}
