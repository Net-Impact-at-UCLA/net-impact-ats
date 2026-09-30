'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// "Review this applicant" for admins and extra reviewers, or "Remove from my queue"
// for an applicant they added themselves.
export default function SelfReviewButton({ roundId, roundName, applicantId, memberId, firstName, selfAdded }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function add() {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('assignments')
      .insert({ round_id: roundId, applicant_id: applicantId, member_id: memberId, self_added: true });
    setBusy(false);
    if (error) return setError('Couldn’t add them. Check that this round is open for scoring and you don’t have a conflict.');
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Remove ${firstName} from your ${roundName} queue? Any scores and notes you entered for them are deleted.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('drop_self_review', { p_round: roundId, p_applicant: applicantId });
    setBusy(false);
    if (error) return setError('Couldn’t remove them. Try again.');
    router.refresh();
  }

  if (selfAdded) {
    return (
      <p className="self-review-note">
        You added {firstName} to your queue.{' '}
        <button type="button" className="link-btn" onClick={remove} disabled={busy}>Remove from my queue</button>
        {error && <span className="form-error"> {error}</span>}
      </p>
    );
  }
  return (
    <section className="self-review">
      <div>
        <h2>Review {firstName} for {roundName}</h2>
        <p className="muted">They&apos;re not in your queue. Add them to score them alongside their assigned reviewers.</p>
      </div>
      <button type="button" className="btn btn-primary" onClick={add} disabled={busy}>
        {busy ? 'Adding…' : 'Review this applicant'}
      </button>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
