'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import StarInput from './StarInput';

// criteria: [{ id, name, min_score, max_score }]
// initialScores: { [criterionId]: number }
// initialNotes: { general: string, [criterionId]: string }
export default function ScorePanel({ round, criteria, initialScores, initialNotes, applicantId, memberId }) {
  const supabase = useMemo(() => createClient(), []);
  const [scores, setScores] = useState(initialScores);
  const [notes, setNotes] = useState(initialNotes);
  const [openNotes, setOpenNotes] = useState(() => new Set(Object.keys(initialNotes).filter((k) => initialNotes[k])));
  const [status, setStatus] = useState(null); // { kind: 'saving' | 'saved' | 'error', text }
  const savedNotes = useRef({ ...initialNotes });

  const scoredCount = criteria.filter((c) => scores[c.id] != null).length;

  async function saveScore(criterionId, value) {
    const previous = scores[criterionId];
    setScores((s) => ({ ...s, [criterionId]: value }));
    setStatus({ kind: 'saving', text: 'Saving…' });
    const { error } = await supabase
      .from('scores')
      .upsert(
        { criterion_id: criterionId, applicant_id: applicantId, member_id: memberId, score: value },
        { onConflict: 'criterion_id,applicant_id,member_id' }
      );
    if (error) {
      setScores((s) => ({ ...s, [criterionId]: previous }));
      setStatus({ kind: 'error', text: 'That score didn’t save. Check that scoring is still open, then try again.' });
    } else {
      setStatus({ kind: 'saved', text: 'Saved' });
    }
  }

  async function saveNote(key) {
    const body = (notes[key] || '').trim();
    if (body === (savedNotes.current[key] || '').trim()) return;
    setStatus({ kind: 'saving', text: 'Saving…' });
    const criterionId = key === 'general' ? null : key;

    let error;
    if (body) {
      ({ error } = await supabase.from('notes').upsert(
        { round_id: round.id, applicant_id: applicantId, member_id: memberId, criterion_id: criterionId, body },
        { onConflict: 'round_id,applicant_id,member_id,criterion_id' }
      ));
    } else {
      let q = supabase.from('notes').delete().eq('round_id', round.id).eq('applicant_id', applicantId).eq('member_id', memberId);
      q = criterionId ? q.eq('criterion_id', criterionId) : q.is('criterion_id', null);
      ({ error } = await q);
    }

    if (error) {
      setStatus({ kind: 'error', text: 'Your note didn’t save. Copy it somewhere safe and try again.' });
    } else {
      savedNotes.current[key] = body;
      setStatus({ kind: 'saved', text: 'Saved' });
    }
  }

  return (
    <section className="score-panel" aria-labelledby={`score-${round.id}`}>
      <div className="score-head">
        <h2 id={`score-${round.id}`}>Your scores: {round.name}</h2>
        <span className="score-progress">
          {scoredCount} of {criteria.length}
        </span>
      </div>

      <ul className="criteria">
        {criteria.map((c) => (
          <li key={c.id} className="criterion">
            <div className="criterion-top">
              <span className="criterion-name">{c.name}</span>
              <StarInput
                label={c.name}
                value={scores[c.id]}
                min={c.min_score}
                max={c.max_score}
                onChange={(v) => saveScore(c.id, v)}
              />
            </div>
            {openNotes.has(c.id) ? (
              <textarea
                className="textarea textarea-sm"
                rows={3}
                placeholder={`Notes on ${c.name.toLowerCase()}`}
                value={notes[c.id] || ''}
                onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                onBlur={() => saveNote(c.id)}
              />
            ) : (
              <button type="button" className="link-btn link-btn-sm" onClick={() => setOpenNotes((s) => new Set(s).add(c.id))}>
                Add a note
              </button>
            )}
          </li>
        ))}
      </ul>

      <label className="field">
        <span className="field-label">Overall notes</span>
        <textarea
          className="textarea"
          rows={5}
          placeholder="Strengths, concerns, anything the club should hear in deliberations"
          value={notes.general || ''}
          onChange={(e) => setNotes((n) => ({ ...n, general: e.target.value }))}
          onBlur={() => saveNote('general')}
        />
      </label>

      <p className={`save-status save-${status?.kind || 'idle'}`} role="status" aria-live="polite">
        {status?.text || 'Scores save as you click. Notes save when you click away.'}
      </p>
    </section>
  );
}
