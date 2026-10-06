'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Avatar from './Avatar';
import StarInput from './StarInput';

// Coffee chat "My table": search applicants as they sit down, add them to the
// current rotation, and grade each one in their own box.
export default function TableBoard({ round, criteria, applicants, initialEntries, memberId }) {
  const isCoffee = round.stage === 'coffee_chat';
  const unit = isCoffee ? 'Rotation' : 'Group';
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState(initialEntries);
  const [group, setGroup] = useState(() => Math.max(1, ...initialEntries.map((e) => e.group)));
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(null);
  const searchRef = useRef(null);

  const byId = useMemo(() => Object.fromEntries(applicants.map((a) => [a.id, a])), [applicants]);
  const added = new Set(entries.map((e) => e.applicantId));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return applicants.filter((a) => words.every((w) => a.name.toLowerCase().includes(w))).slice(0, 6);
  }, [query, applicants]);

  async function add(a) {
    if (added.has(a.id) || a.conflict) return;
    setMessage(null);
    const { error } = await supabase
      .from('assignments')
      .insert({ round_id: round.id, applicant_id: a.id, member_id: memberId, group_no: group });
    if (error) {
      setMessage({ kind: 'error', text: `Couldn’t add ${a.name}. Check that ${round.name} scoring is still open.` });
      return;
    }
    setEntries((es) => [...es, { applicantId: a.id, group, addedAt: new Date().toISOString(), scores: {}, notes: '' }]);
    setQuery('');
    searchRef.current?.focus();
  }

  async function remove(applicantId) {
    const a = byId[applicantId];
    if (!window.confirm(`Remove ${a?.name || 'this applicant'} from your table? Anything you entered for them is deleted.`)) return;
    const { error } = await supabase.rpc('remove_from_table', { p_round: round.id, p_applicant: applicantId });
    if (error) return setMessage({ kind: 'error', text: 'Couldn’t remove them. Try again.' });
    setEntries((es) => es.filter((e) => e.applicantId !== applicantId));
  }

  function nextRotation() {
    setGroup((g) => g + 1);
    setQuery('');
    setMessage(null);
    searchRef.current?.focus();
  }

  const current = entries.filter((e) => e.group === group);
  const earlier = [...new Set(entries.filter((e) => e.group < group).map((e) => e.group))].sort((a, b) => b - a);

  return (
    <div className="table-board">
      <div className="table-head">
        <div>
          <h1>My table</h1>
          <p className="muted">
            {round.name}: {isCoffee ? 'search each applicant as they sit down, then grade them here.' : 'search for the applicants in your room, add them, and grade them here.'}
          </p>
        </div>
        <button type="button" className="btn btn-quiet" onClick={nextRotation} disabled={current.length === 0}>
          Next {unit.toLowerCase()}
        </button>
      </div>

      <div className="table-search">
        <input
          ref={searchRef}
          type="search"
          className="table-search-input"
          placeholder="Type an applicant’s name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const first = results.find((r) => !added.has(r.id) && !r.conflict);
              if (first) add(first);
            }
          }}
          aria-label="Search applicants"
          autoFocus
        />
        {query.trim() && (
          <ul className="table-results" role="listbox" aria-label="Matching applicants">
            {results.length === 0 && <li className="table-result-empty">No applicant in {round.name} matches “{query.trim()}”.</li>}
            {results.map((a) => {
              const isAdded = added.has(a.id);
              return (
                <li key={a.id} className="table-result">
                  <Avatar name={a.name} src={a.headshot} size={44} />
                  <span className="table-result-main">
                    <span className="table-result-name">{a.name}</span>
                    <span className="muted">{a.detail}</span>
                  </span>
                  {a.conflict ? (
                    <span className="muted table-result-note">Conflict flagged</span>
                  ) : isAdded ? (
                    <span className="muted table-result-note">Already added</span>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => add(a)}>Add</button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {message && <p className={message.kind === 'error' ? 'form-error' : 'form-ok'} role="alert">{message.text}</p>}
      </div>

      <section className="rotation" aria-label={`${unit} ${group}, at your table now`}>
        <h2>
          {unit} {group} <span className="muted">{isCoffee ? 'at your table now' : 'in your room now'}</span>
        </h2>
        {current.length === 0 ? (
          <p className="muted rotation-empty">{isCoffee ? 'Search for the applicants who just sat down to add them here.' : 'Search for each applicant in your group to add them here.'}</p>
        ) : (
          <div className="chat-cards">
            {current.map((e) => (
              <ChatCard
                key={e.applicantId}
                entry={e}
                applicant={byId[e.applicantId]}
                criteria={criteria}
                round={round}
                memberId={memberId}
                supabase={supabase}
                onRemove={() => remove(e.applicantId)}
                onChange={(patch) => setEntries((es) => es.map((x) => (x.applicantId === e.applicantId ? { ...x, ...patch } : x)))}
              />
            ))}
          </div>
        )}
      </section>

      {earlier.map((g) => (
        <section key={g} className="rotation rotation-earlier" aria-label={`${unit} ${g}`}>
          <h2>{unit} {g}</h2>
          <div className="chat-cards chat-cards-compact">
            {entries.filter((e) => e.group === g).map((e) => (
              <ChatCard
                key={e.applicantId}
                entry={e}
                applicant={byId[e.applicantId]}
                criteria={criteria}
                round={round}
                memberId={memberId}
                supabase={supabase}
                compact
                onRemove={() => remove(e.applicantId)}
                onChange={(patch) => setEntries((es) => es.map((x) => (x.applicantId === e.applicantId ? { ...x, ...patch } : x)))}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function ChatCard({ entry, applicant, criteria, round, memberId, supabase, compact, onRemove, onChange }) {
  const [status, setStatus] = useState(null);
  const [notes, setNotes] = useState(entry.notes);
  const saved = useRef(entry.notes);
  if (!applicant) return null;

  async function score(criterionId, value) {
    const prev = entry.scores[criterionId];
    onChange({ scores: { ...entry.scores, [criterionId]: value } });
    const { error } = await supabase.from('scores').upsert(
      { criterion_id: criterionId, applicant_id: applicant.id, member_id: memberId, score: value },
      { onConflict: 'criterion_id,applicant_id,member_id' }
    );
    if (error) {
      onChange({ scores: { ...entry.scores, [criterionId]: prev } });
      setStatus({ kind: 'error', text: 'Score didn’t save' });
    } else setStatus({ kind: 'saved', text: 'Saved' });
  }

  async function saveNotes() {
    const body = notes.trim();
    if (body === (saved.current || '').trim()) return;
    let error;
    if (body) {
      ({ error } = await supabase.from('notes').upsert(
        { round_id: round.id, applicant_id: applicant.id, member_id: memberId, criterion_id: null, body },
        { onConflict: 'round_id,applicant_id,member_id,criterion_id' }
      ));
    } else {
      ({ error } = await supabase.from('notes').delete().eq('round_id', round.id).eq('applicant_id', applicant.id).eq('member_id', memberId).is('criterion_id', null));
    }
    if (error) return setStatus({ kind: 'error', text: 'Notes didn’t save; copy them somewhere safe' });
    saved.current = body;
    onChange({ notes: body });
    setStatus({ kind: 'saved', text: 'Saved' });
  }

  const got = criteria.filter((c) => entry.scores[c.id] != null).length;
  const done = got === criteria.length;

  return (
    <article className={`chat-card ${compact ? 'chat-card-compact' : ''} ${done ? 'chat-card-done' : ''}`}>
      <button type="button" className="chat-remove" onClick={onRemove} aria-label={`Remove ${applicant.name} from your table`}>
        ×
      </button>
      <div className="chat-id">
        <Avatar name={applicant.name} src={applicant.headshot} size={compact ? 56 : criteria.length > 1 ? 96 : 112} />
        <div>
          <h3>{applicant.name}</h3>
          {applicant.pronouns && <p className="muted">{applicant.pronouns}</p>}
          {!compact && applicant.detail && <p className="muted chat-detail">{applicant.detail}</p>}
          {round.stage !== 'coffee_chat' && (
            <a href={`/applicants/${applicant.id}`} target="_blank" rel="noreferrer" className="chat-section-notes">Section notes</a>
          )}
        </div>
      </div>
      <div className={`chat-scores ${criteria.length > 1 ? 'chat-scores-multi' : ''}`}>
        {criteria.map((c) => (
          <div key={c.id} className="chat-criterion">
            {criteria.length > 1 && <span className="criterion-name">{c.name}</span>}
            <StarInput label={`${c.name} for ${applicant.name}`} value={entry.scores[c.id]} min={c.min_score} max={c.max_score} onChange={(v) => score(c.id, v)} />
          </div>
        ))}
      </div>
      <textarea
        className="textarea textarea-sm"
        rows={compact ? 2 : criteria.length > 1 ? 3 : 4}
        placeholder={round.stage === 'coffee_chat' ? 'Notes from your conversation' : 'Overall notes on their performance'}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={saveNotes}
        aria-label={`Notes on ${applicant.name}`}
      />
      <p className={`save-status save-${status?.kind || 'idle'}`} role="status" aria-live="polite">
        {status?.text || (done ? 'All scored' : got ? `${got} of ${criteria.length} scored` : 'Not scored yet')}
      </p>
    </article>
  );
}
