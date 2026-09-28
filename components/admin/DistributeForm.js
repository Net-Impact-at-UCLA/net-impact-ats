'use client';

import { useActionState, useMemo, useState } from 'react';
import { distributeReviewers } from '@/app/admin/actions';

// rounds: [{ id, name, phase, activeCount, assignedCount, scoredCount }]
// members: [{ id, full_name, email }]
// progress: { [roundId]: { [memberId]: { assigned, done } } }
export default function DistributeForm({ rounds, members, progress }) {
  const [state, action, pending] = useActionState(distributeReviewers, null);
  const [roundId, setRoundId] = useState(rounds[0]?.id);
  const [selected, setSelected] = useState(() => new Set());
  const [perApplicant, setPerApplicant] = useState(2);
  const [onlyNew, setOnlyNew] = useState(true);

  const round = rounds.find((r) => r.id === roundId);
  const roundProgress = progress[roundId] || {};
  const allOn = selected.size === members.length && members.length > 0;

  const topUp = onlyNew && round?.assignedCount > 0;
  const preview = useMemo(() => {
    const n = topUp ? round?.unassignedCount || 0 : round?.activeCount || 0;
    const m = selected.size;
    if (!n || !m) return null;
    const k = Math.min(perApplicant, m);
    const total = n * k;
    const lo = Math.floor(total / m);
    const hi = Math.ceil(total / m);
    if (topUp) return `${n} applicant${n === 1 ? '' : 's'} without a reviewer will be spread across the selected members, ${k} reviewer${k === 1 ? '' : 's'} each, favoring whoever has the fewest.`;
    return `${n} applicants, ${k} reviewer${k === 1 ? '' : 's'} each: every selected member gets ${lo === hi ? lo : `${lo} or ${hi}`}.`;
  }, [round, selected, perApplicant, topUp]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function confirmReplace(e) {
    if (round?.assignedCount > 0 && !topUp) {
      const extra = round.scoredCount > 0
        ? ` ${round.scoredCount} scores have already been entered; reviewers who lose an applicant can no longer edit those scores.`
        : '';
      if (!window.confirm(`This replaces the current assignments for ${round.name}.${extra} Continue?`)) {
        e.preventDefault();
      }
    }
  }

  return (
    <form action={action} onSubmit={confirmReplace} className="stack">
      <div className="form-grid">
        <label className="field">
          <span className="field-label">Round</span>
          <select name="roundId" className="select" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            {rounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.activeCount} active)
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Reviewers per applicant</span>
          <input
            name="perApplicant"
            type="number"
            min={1}
            max={10}
            className="input input-narrow"
            value={perApplicant}
            onChange={(e) => setPerApplicant(Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </label>
      </div>

      {round?.assignedCount > 0 && (
        <fieldset className="mode">
          <legend className="field-label">What to assign</legend>
          <label className="check">
            <input type="radio" name="mode" value="new" checked={onlyNew} onChange={() => setOnlyNew(true)} />
            <span>
              Only applicants without a reviewer{' '}
              <span className="muted">({round.unassignedCount} right now; keeps current assignments)</span>
            </span>
          </label>
          <label className="check">
            <input type="radio" name="mode" value="all" checked={!onlyNew} onChange={() => setOnlyNew(false)} />
            <span>
              Everyone, starting over <span className="muted">(replaces current assignments)</span>
            </span>
          </label>
        </fieldset>
      )}

      <fieldset className="checklist">
        <legend className="field-label">
          Reviewers{' '}
          <button
            type="button"
            className="link-btn"
            onClick={() => setSelected(allOn ? new Set() : new Set(members.map((m) => m.id)))}
          >
            {allOn ? 'Clear all' : 'Select all'}
          </button>
        </legend>
        {members.map((m) => {
          const p = roundProgress[m.id];
          return (
            <label key={m.id} className="check">
              <input type="checkbox" name="memberIds" value={m.id} checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
              <span className="check-name">{m.full_name || m.email}</span>
              {p && (
                <span className="check-meta">
                  {p.done} of {p.assigned} scored
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      {preview && <p className="muted">{preview}</p>}

      <div className="form-row">
        <button className="btn btn-primary" disabled={pending || selected.size === 0}>
          {pending ? 'Assigning…' : topUp ? 'Assign new applicants' : round?.assignedCount ? 'Reassign everyone' : 'Assign reviewers'}
        </button>
        {state?.ok && <p className="form-ok" role="status">{state.ok}</p>}
        {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      </div>
    </form>
  );
}
