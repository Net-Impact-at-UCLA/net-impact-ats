'use client';

import { useActionState } from 'react';
import { createEvent, uploadAttendance, deleteEvent } from '@/app/admin/actions';
import ConfirmButton from '@/components/ConfirmButton';

// events: [{ id, name, held_on, attendeeCount, matchedCount }]
export default function EventsPanel({ events, applicantCount }) {
  const [createState, createAction, creating] = useActionState(createEvent, null);
  return (
    <div className="stack">
      {events.length > 0 && (
        <ul className="event-list">
          {events.map((e) => (
            <EventRow key={e.id} event={e} applicantCount={applicantCount} />
          ))}
        </ul>
      )}
      <form action={createAction} className="form-row event-create">
        <input name="name" className="input" placeholder="New event, e.g. Info Session" aria-label="Event name" required />
        <input name="held_on" type="date" className="input" aria-label="Event date" />
        <button className="btn btn-quiet" disabled={creating}>{creating ? 'Adding…' : 'Add event'}</button>
        {createState?.ok && <p className="form-ok" role="status">{createState.ok}</p>}
        {createState?.error && <p className="form-error" role="alert">{createState.error}</p>}
      </form>
    </div>
  );
}

function EventRow({ event, applicantCount }) {
  const [state, action, pending] = useActionState(uploadAttendance, null);
  return (
    <li className="event-row">
      <div className="event-info">
        <span className="event-name">{event.name}</span>
        <span className="muted">
          {event.held_on && `${new Date(event.held_on + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, `}
          {event.attendeeCount ? `${event.attendeeCount} on the sign-in list, ${event.matchedCount} of ${applicantCount} applicants attended` : 'No sign-in sheet uploaded yet'}
        </span>
      </div>
      <form action={action} className="event-upload">
        <input type="hidden" name="eventId" value={event.id} />
        <input type="file" name="file" accept=".csv,.xlsx" className="file-input" aria-label={`Sign-in sheet for ${event.name}`} required />
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Uploading…' : event.attendeeCount ? 'Replace list' : 'Upload list'}</button>
      </form>
      <form action={deleteEvent}>
        <input type="hidden" name="eventId" value={event.id} />
        <ConfirmButton className="link-btn" message={`Delete ${event.name}? Its attendance list and badges are removed.`}>Delete</ConfirmButton>
      </form>
      {state?.ok && <p className="form-ok event-msg" role="status">{state.ok}</p>}
      {state?.error && <p className="form-error event-msg" role="alert">{state.error}</p>}
    </li>
  );
}
