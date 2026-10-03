'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Adds N applicants to your queue, least-reviewed first.
export default function ReviewMoreButton({ roundId, roundName }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function claim() {
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase.rpc('claim_more_reviews', { p_round: roundId, p_count: count });
    setBusy(false);
    if (error) return setMsg({ kind: 'error', text: 'Couldn’t add applicants. Check that scoring is still open.' });
    if (!data) return setMsg({ kind: 'ok', text: `You’re already reviewing everyone available in ${roundName}.` });
    setMsg({ kind: 'ok', text: `Added ${data} applicant${data === 1 ? '' : 's'} to your queue${data < count ? ' (that’s everyone left)' : ''}.` });
    router.refresh();
  }

  return (
    <div className="review-more">
      <label className="review-more-label">
        <span>Review</span>
        <input
          type="number"
          min={1}
          max={25}
          className="input review-more-count"
          value={count}
          onChange={(e) => setCount(Math.min(25, Math.max(1, parseInt(e.target.value, 10) || 1)))}
          aria-label="How many more applicants"
        />
        <span>more</span>
      </label>
      <button type="button" className="btn btn-primary" onClick={claim} disabled={busy}>
        {busy ? 'Adding…' : 'Review more applicants'}
      </button>
      <span className="muted review-more-hint">Picks whoever has the fewest reviews so far.</span>
      {msg && <span className={msg.kind === 'error' ? 'form-error' : 'form-ok'} role="status">{msg.text}</span>}
    </div>
  );
}
