'use client';

import { useActionState } from 'react';
import { addMembers } from '@/app/admin/actions';

export default function RosterForm() {
  const [state, action, pending] = useActionState(addMembers, null);
  return (
    <form action={action} className="stack">
      <label htmlFor="lines" className="field-label">
        Add members, one per line: email, then name
      </label>
      <textarea
        id="lines"
        name="lines"
        rows={4}
        className="textarea"
        placeholder={'jane.doe@g.ucla.edu, Jane Doe\nalex.kim@g.ucla.edu, Alex Kim'}
      />
      <div className="form-row">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Add members'}
        </button>
        {state?.ok && <p className="form-ok" role="status">{state.ok}</p>}
        {state?.error && <p className="form-error" role="alert">{state.error}</p>}
      </div>
    </form>
  );
}
