'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import StarInput from './StarInput';

// Deliberation vote for one applicant in one round.
// initial: { stars, recused } | null. conflicted: member flagged a conflict.
export default function VotePanel({ round, applicantId, memberId, initial, conflicted, next, votedCount, totalCount }) {
  const supabase = useMemo(() => createClient(), []);
  const [stars, setStars] = useState(initial?.recused ? null : initial?.stars ?? null);
  const [recused, setRecused] = useState(!!initial?.recused);
  const [status, setStatus] = useState(null);

  async function save(next) {
    const prev = { stars, recused };
    setStars(next.stars);
    setRecused(next.recused);
    setStatus({ kind: 'saving', text: 'Saving…' });
    const { error } = await supabase
      .from('votes')
      .upsert(
        { round_id: round.id, applicant_id: applicantId, member_id: memberId, stars: next.stars, recused: next.recused },
        { onConflict: 'round_id,applicant_id,member_id' }
      );
    if (error) {
      setStars(prev.stars);
      setRecused(prev.recused);
      setStatus({ kind: 'error', text: 'Your vote didn’t save. Check that voting is still open, then try again.' });
    } else {
      setStatus({ kind: 'saved', text: next.recused ? 'Recused' : 'Vote saved' });
    }
  }

  const voted = recused || stars != null;

  return (
    <section className="score-panel vote-panel" aria-labelledby={`vote-${round.id}`}>
      <div className="score-head">
        <h2 id={`vote-${round.id}`}>Your vote: {round.name}</h2>
        <span className="score-progress">{votedCount} of {totalCount} voted</span>
      </div>

      {conflicted ? (
        <p className="muted">You flagged a conflict with this applicant, so you sit out their vote.</p>
      ) : (
        <>
          <p className="muted vote-help">How strongly should they advance? Your vote is private until results are released.</p>
          <div className={`vote-stars ${recused ? 'vote-stars-off' : ''}`}>
            <StarInput label="Your vote" value={recused ? null : stars} min={1} max={5} onChange={(v) => save({ stars: v, recused: false })} />
          </div>
          <label className="check recuse">
            <input
              type="checkbox"
              checked={recused}
              onChange={(e) => save(e.target.checked ? { stars: null, recused: true } : { stars: null, recused: false })}
            />
            <span>Recuse me from this vote</span>
          </label>
          <p className={`save-status save-${status?.kind || 'idle'}`} role="status" aria-live="polite">
            {status?.text || (voted ? (recused ? 'You recused yourself.' : 'Vote saved. You can change it until voting closes.') : 'Not voted yet.')}
          </p>
        </>
      )}

      <div className="next-queue">
        {next ? (
          <Link href={`/applicants/${next.id}`} className="btn btn-primary btn-wide">
            Next to vote: {next.name}
          </Link>
        ) : (
          <p className="muted next-done">
            You’ve voted on everyone in this round. <Link href="/">Back to applicants</Link>
          </p>
        )}
      </div>
    </section>
  );
}
