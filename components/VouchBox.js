'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// myVouch: { reason } | null. count: total vouches. adminVouches: [{ name, reason }] (admins only)
export default function VouchBox({ applicantId, memberId, firstName, myVouch, count, adminVouches }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(myVouch?.reason || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(e) {
    e.preventDefault();
    if (!reason.trim()) return setError('Add a short reason before vouching.');
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('vouches')
      .upsert({ applicant_id: applicantId, member_id: memberId, reason: reason.trim() }, { onConflict: 'applicant_id,member_id' });
    setBusy(false);
    if (error) return setError('Your vouch didn’t save. Try again.');
    setEditing(false);
    router.refresh();
  }

  async function withdraw() {
    if (!window.confirm(`Withdraw your hard vouch for ${firstName}?`)) return;
    setBusy(true);
    const { error } = await supabase.from('vouches').delete().eq('applicant_id', applicantId).eq('member_id', memberId);
    setBusy(false);
    if (error) return setError('Couldn’t withdraw. Try again.');
    setReason('');
    router.refresh();
  }

  return (
    <section className="vouch" aria-label="Hard vouch">
      {count > 0 && (
        <p className="vouch-count">
          <span className="vouch-mark" aria-hidden="true" />
          Hard vouched{count > 1 ? ` by ${count} members` : ''}
        </p>
      )}

      {editing ? (
        <form onSubmit={save} className="stack">
          <label className="field">
            <span className="field-label">Why are you hard vouching for {firstName}?</span>
            <textarea
              className="textarea textarea-sm"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="How you know them and why they'd be great"
              autoFocus
            />
          </label>
          <div className="form-row">
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : myVouch ? 'Update vouch' : 'Hard vouch'}</button>
            <button type="button" className="link-btn" onClick={() => { setEditing(false); setReason(myVouch?.reason || ''); setError(null); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : myVouch ? (
        <div className="vouch-mine">
          <p className="vouch-mine-title">You hard vouched</p>
          <p className="prose vouch-reason">{myVouch.reason}</p>
          <div className="form-row">
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>Edit</button>
            <button type="button" className="link-btn" onClick={withdraw} disabled={busy}>Withdraw</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-vouch" onClick={() => setEditing(true)}>Hard vouch</button>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      {adminVouches?.length > 0 && (
        <div className="vouch-admin">
          <h3>Who vouched <span className="muted">(admins only)</span></h3>
          <ul>
            {adminVouches.map((v) => (
              <li key={v.name}>
                <strong>{v.name}</strong>
                <span className="prose">{v.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
