'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import MoveToMakeupButton from './MoveToMakeupButton';

// Admin: decide makeup coffee chats after the main cutoff.
// rows: [{ id, name, avg, graders, advanced }]
export default function MakeupDecisions({ roundId, roundName = 'this round', rows, released, nextRoundName }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function decide(r, decision) {
    const what = decision === 'advance' ? `Advance ${r.name} to ${nextRoundName || 'the next round'}?` : decision === 'out' ? `Mark ${r.name} as not advancing?` : `Put ${r.name} back to undecided?`;
    if (!window.confirm(what)) return;
    setBusy(r.id);
    setError(null);
    const { error } = await supabase.rpc('decide_makeup', { p_round: roundId, p_applicant: r.id, p_decision: decision });
    setBusy(null);
    if (error) return setError(`${r.name}: ${error.message}`);
    router.refresh();
  }

  return (
    <section className="panel-lite">
      <h2>{roundName} makeups</h2>
      <p className="muted panel-sub">
        Held out of the vote and cutoff. Members grade them on My table after their makeup;{' '}
        {released ? 'decide each one here.' : 'you can decide them here once the main cutoff is applied.'}
      </p>
      {error && <p className="form-error">{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Applicant</th>
              <th scope="col" className="num">Avg score</th>
              <th scope="col" className="num">Graded by</th>
              <th scope="col">Status</th>
              {released && <th scope="col"><span className="sr-only">Decide</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/applicants/${r.id}`}>{r.name}</Link></td>
                <td className="num"><strong>{r.avg == null ? '·' : r.avg.toFixed(2)}</strong></td>
                <td className="num">{r.graders}</td>
                <td>{r.advanced == null ? 'Waiting on makeup' : r.advanced ? `Advanced to ${nextRoundName || 'next round'}` : 'Not advancing'}</td>
                {released && (
                  <td className="makeup-actions">
                    {r.advanced == null ? (
                      <>
                        <button type="button" className="btn btn-primary push-btn" disabled={busy === r.id} onClick={() => decide(r, 'advance')}>
                          Advance{nextRoundName ? ` to ${nextRoundName}` : ''}
                        </button>
                        <button type="button" className="btn btn-danger-quiet push-btn" disabled={busy === r.id} onClick={() => decide(r, 'out')}>
                          Not advancing
                        </button>
                        <MoveToMakeupButton roundId={roundId} applicantId={r.id} name={r.name} back />
                      </>
                    ) : (
                      <button type="button" className="link-btn" disabled={busy === r.id} onClick={() => decide(r, 'pending')}>Undo</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
