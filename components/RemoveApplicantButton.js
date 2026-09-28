'use client';

import { useFormStatus } from 'react-dom';
import { removeApplicant } from '@/app/applicants/[id]/actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-danger" disabled={pending}>
      {pending ? 'Removing…' : 'Remove applicant'}
    </button>
  );
}

export default function RemoveApplicantButton({ id, name }) {
  function confirmRemove(e) {
    const ok = window.confirm(
      `Remove ${name} from the ATS?\n\nThis permanently deletes their profile, files, and every score, note, vote, and vouch on them. It can't be undone.`
    );
    if (!ok) e.preventDefault();
  }
  return (
    <form action={removeApplicant} onSubmit={confirmRemove} className="remove-applicant">
      <input type="hidden" name="id" value={id} />
      <Submit />
    </form>
  );
}
