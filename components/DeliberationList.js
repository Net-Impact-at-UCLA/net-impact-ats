'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Avatar from './Avatar';
import StarInput from './StarInput';

// Everyone in the round being deliberated, one long searchable list with inline votes.
export default function DeliberationList({ round, applicants, memberId, initialVotes, conflictIds, isAdmin }) {
  const supabase = useMemo(() => createClient(), []);
  const [votes, setVotes] = useState(initialVotes);
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState({});
  const conflicts = useMemo(() => new Set(conflictIds), [conflictIds]);

  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return applicants.filter((a) => words.every((w) => a.name.toLowerCase().includes(w)));
  }, [applicants, query]);

  const votable = applicants.filter((a) => !conflicts.has(a.id));
  const votedCount = votable.filter((a) => votes[a.id]).length;

  // next = { stars, recused } to save, or null to withdraw the vote
  async function save(applicantId, next) {
    const prev = votes[applicantId];
    setVotes((v) => {
      const copy = { ...v };
      if (next) copy[applicantId] = next;
      else delete copy[applicantId];
      return copy;
    });
    setErrors((e) => ({ ...e, [applicantId]: null }));
    const { error } = next
      ? await supabase
          .from('votes')
          .upsert(
            { round_id: round.id, applicant_id: applicantId, member_id: memberId, stars: next.stars, recused: next.recused },
            { onConflict: 'round_id,applicant_id,member_id' }
          )
      : await supabase.from('votes').delete().eq('round_id', round.id).eq('applicant_id', applicantId).eq('member_id', memberId);
    if (error) {
      setVotes((v) => ({ ...v, [applicantId]: prev }));
      setErrors((e) => ({ ...e, [applicantId]: 'Didn’t save. Is voting still open?' }));
    }
  }

  return (
    <div className="delib">
      <div className="delib-head">
        <div>
          <h1>Deliberations</h1>
          <p className="muted">
            {round.name}: find the applicant being discussed and give your final vote. Votes stay private until the cutoff is applied.
          </p>
        </div>
        <div className="delib-head-right">
          <span className="delib-count">
            <strong>{votedCount}</strong> of {votable.length} voted
          </span>
          {isAdmin && (
            <Link href="/deliberate/present" className="btn btn-quiet" target="_blank">
              Open TV view
            </Link>
          )}
        </div>
      </div>

      <input
        type="search"
        className="table-search-input delib-search"
        placeholder="Search for the applicant being discussed"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search applicants"
        autoFocus
      />

      {shown.length === 0 ? (
        <p className="no-results">No one in {round.name} matches “{query.trim()}”.</p>
      ) : (
        <ul className="delib-list">
          {shown.map((a) => {
            const v = votes[a.id];
            const conflicted = conflicts.has(a.id);
            return (
              <li key={a.id} className={`delib-row ${v ? 'delib-voted' : ''} ${conflicted ? 'delib-conflict' : ''}`}>
                <Avatar name={a.name} src={a.headshot} size={56} />
                <span className="delib-main">
                  <span className="delib-name">
                    {a.name}
                    {a.vouches > 0 && <span className="vouch-pill">Hard vouched{a.vouches > 1 ? ` ×${a.vouches}` : ''}</span>}
                    {a.byVouch && <span className="vouch-pill vouch-adv">Advancing: hard vouch</span>}
                  </span>
                  <span className="muted delib-detail">{a.detail}</span>
                </span>
                {conflicted ? (
                  <span className="muted delib-note">Conflict flagged: you sit out this vote</span>
                ) : (
                  <span className="delib-vote">
                    <span className={v?.recused ? 'vote-stars-off' : ''}>
                      <StarInput
                        label={`Your vote for ${a.name}`}
                        value={v?.recused ? null : v?.stars ?? null}
                        min={0}
                        max={5}
                        onChange={(stars) => save(a.id, { stars, recused: false })}
                      />
                    </span>
                    <label className="check delib-recuse">
                      <input
                        type="checkbox"
                        checked={!!v?.recused}
                        onChange={(e) => save(a.id, e.target.checked ? { stars: null, recused: true } : null)}
                      />
                      <span>Recuse</span>
                    </label>
                    {errors[a.id] && <span className="form-error delib-error">{errors[a.id]}</span>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
