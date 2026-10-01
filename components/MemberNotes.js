'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Free-form notes any member can leave on an applicant, visible to all members.
// notes: [{ id, body, created_at, updated_at, member_id, author }]
export default function MemberNotes({ applicantId, memberId, isAdmin, initialNotes, firstName }) {
  const supabase = useMemo(() => createClient(), []);
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null); // { id, body }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  async function post(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from('member_notes')
      .insert({ applicant_id: applicantId, member_id: memberId, body })
      .select('id, body, created_at, updated_at, member_id')
      .single();
    setBusy(false);
    if (error) return setError('Your note didn’t post. Try again.');
    setNotes((n) => [...n, { ...data, author: 'You' }]);
    setDraft('');
  }

  async function saveEdit() {
    const body = editing.body.trim();
    if (!body) return;
    const { error } = await supabase.from('member_notes').update({ body }).eq('id', editing.id);
    if (error) return setError('Couldn’t save your edit.');
    setNotes((n) => n.map((x) => (x.id === editing.id ? { ...x, body, updated_at: new Date().toISOString() } : x)));
    setEditing(null);
  }

  async function remove(id) {
    if (!window.confirm('Delete this note?')) return;
    const { error } = await supabase.from('member_notes').delete().eq('id', id);
    if (error) return setError('Couldn’t delete the note.');
    setNotes((n) => n.filter((x) => x.id !== id));
  }

  return (
    <section className="block member-notes" aria-labelledby="member-notes-title">
      <div className="block-head">
        <h2 id="member-notes-title">Member notes</h2>
        <span className="muted">Visible to all members</span>
      </div>

      {notes.length === 0 ? (
        <p className="muted">No notes yet. Met {firstName} somewhere, or have context the club should know? Add it below.</p>
      ) : (
        <ul className="mnote-list">
          {notes.map((n) => {
            const mine = n.member_id === memberId;
            return (
              <li key={n.id} className="mnote">
                <div className="mnote-head">
                  <strong>{mine ? 'You' : n.author}</strong>
                  <span className="muted">
                    {when(n.created_at)}
                    {n.updated_at && n.updated_at !== n.created_at && new Date(n.updated_at) - new Date(n.created_at) > 60000 ? ' (edited)' : ''}
                  </span>
                  <span className="mnote-actions">
                    {mine && editing?.id !== n.id && (
                      <button type="button" className="link-btn" onClick={() => setEditing({ id: n.id, body: n.body })}>Edit</button>
                    )}
                    {(mine || isAdmin) && (
                      <button type="button" className="link-btn" onClick={() => remove(n.id)}>Delete</button>
                    )}
                  </span>
                </div>
                {editing?.id === n.id ? (
                  <div className="stack">
                    <textarea className="textarea textarea-sm" rows={3} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} maxLength={2000} />
                    <div className="form-row">
                      <button type="button" className="btn btn-primary" onClick={saveEdit}>Save</button>
                      <button type="button" className="link-btn" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="prose">{n.body}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={post} className="stack mnote-form">
        <textarea
          className="textarea"
          rows={3}
          maxLength={2000}
          placeholder={`Add a note about ${firstName}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Add a note about ${firstName}`}
        />
        <div className="form-row">
          <button className="btn btn-primary" disabled={busy || !draft.trim()}>{busy ? 'Posting…' : 'Post note'}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </form>
    </section>
  );
}
