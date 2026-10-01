'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Event attendance on a profile. Admins can check people off by hand.
// events: [{ id, name }], attended: { eventId: 'email'|'name'|'manual' }
export default function AttendanceBadges({ applicantId, events, attended, isAdmin }) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState(attended);
  const [error, setError] = useState(null);
  if (!events.length) return null;

  async function toggle(eventId) {
    const how = state[eventId];
    setError(null);
    if (how === 'manual') {
      const { error } = await supabase.from('event_manual').delete().eq('event_id', eventId).eq('applicant_id', applicantId);
      if (error) return setError('Couldn’t update attendance.');
      setState((s) => { const c = { ...s }; delete c[eventId]; return c; });
    } else if (!how) {
      const { error } = await supabase.from('event_manual').insert({ event_id: eventId, applicant_id: applicantId });
      if (error) return setError('Couldn’t update attendance.');
      setState((s) => ({ ...s, [eventId]: 'manual' }));
    }
  }

  return (
    <div className="attendance">
      <span className="facts-label">Events</span>
      <ul className="attend-list">
        {events.map((e) => {
          const how = state[e.id];
          return (
            <li key={e.id} className={`attend ${how ? 'attend-yes' : 'attend-no'}`}>
              <span className="attend-mark" aria-hidden="true">{how ? '✓' : '–'}</span>
              <span>{e.name}</span>
              {how === 'name' && <span className="attend-how" title="Matched by name because the sign-in email was different">by name</span>}
              {isAdmin && how !== 'email' && how !== 'name' && (
                <button type="button" className="link-btn attend-toggle" onClick={() => toggle(e.id)}>
                  {how === 'manual' ? 'Undo' : 'Mark attended'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
