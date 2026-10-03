'use server';

import { revalidatePath } from 'next/cache';
import { getSession, fetchAll } from '@/lib/session';
import { distribute } from '@/lib/distribute';
import { createAdminClient } from '@/lib/supabase/admin';

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

async function requireAdmin() {
  const session = await getSession();
  if (session.member?.role !== 'admin') throw new Error('Only admins can do this.');
  return session;
}

// Paste one member per line: "email, Full Name" (name optional).
export async function addMembers(_prev, formData) {
  const { supabase } = await requireAdmin();
  const lines = String(formData.get('lines') || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const named = [];
  const unnamed = [];
  const skipped = [];
  for (const line of lines) {
    const [first, ...rest] = line.split(/[,\t]/);
    const email = first.trim().toLowerCase();
    if (!EMAIL.test(email)) {
      skipped.push(line);
      continue;
    }
    const name = rest.join(' ').trim();
    if (name) named.push({ email, full_name: name, is_active: true });
    else unnamed.push({ email, is_active: true });
  }

  if (named.length + unnamed.length === 0) {
    return { error: skipped.length ? `Couldn't find an email in: ${skipped.join('; ')}` : 'Paste at least one email.' };
  }

  for (const rows of [named, unnamed]) {
    if (!rows.length) continue;
    const { error } = await supabase.from('members').upsert(rows, { onConflict: 'email' });
    if (error) return { error: `Couldn't save members: ${error.message}` };
  }

  revalidatePath('/admin');
  const count = named.length + unnamed.length;
  return {
    ok: `Saved ${count} member${count === 1 ? '' : 's'}.` +
      (skipped.length ? ` Skipped ${skipped.length} line${skipped.length === 1 ? '' : 's'} without a valid email.` : ''),
  };
}

export async function updateMember(formData) {
  const { supabase, member } = await requireAdmin();
  const id = String(formData.get('id'));
  const action = String(formData.get('action'));
  if (id === member.id) return; // never lock yourself out

  const changes = {
    remove: { is_active: false },
    restore: { is_active: true },
    make_admin: { role: 'admin' },
    make_member: { role: 'member' },
    make_extra: { extra_reviewer: true },
    remove_extra: { extra_reviewer: false },
  }[action];
  if (!changes) return;

  await supabase.from('members').update(changes).eq('id', id);
  revalidatePath('/admin');
}

export async function setRoundPhase(formData) {
  const { supabase } = await requireAdmin();
  const roundId = String(formData.get('roundId'));
  const phase = String(formData.get('phase'));
  const allowed = {
    setup: ['scoring'],
    scoring: ['setup', 'voting'],
    voting: ['scoring', 'closed'],
    closed: ['voting'],
  };
  const { data: round } = await supabase.from('rounds').select('phase').eq('id', roundId).maybeSingle();
  if (!round || !allowed[round.phase]?.includes(phase)) return;
  await supabase.from('rounds').update({ phase }).eq('id', roundId);
  revalidatePath(`/rounds/${roundId}`);
  revalidatePath('/admin');
  revalidatePath('/');
}

export async function distributeReviewers(_prev, formData) {
  const { supabase } = await requireAdmin();
  const roundId = String(formData.get('roundId'));
  const memberIds = formData.getAll('memberIds').map(String);
  const perApplicant = Math.max(1, parseInt(formData.get('perApplicant'), 10) || 1);
  const onlyNew = formData.get('mode') === 'new';
  const weights = {};
  memberIds.forEach((id) => {
    const w = parseInt(formData.get(`weight_${id}`), 10);
    if (w >= 2 && w <= 5) weights[id] = w;
  });

  if (memberIds.length === 0) return { error: 'Select at least one member.' };

  const { data: inRound, error: readError } = await supabase
    .from('round_applicants')
    .select('applicant_id, applicants(status)')
    .eq('round_id', roundId);
  if (readError) return { error: `Couldn't read applicants: ${readError.message}` };

  let applicantIds = (inRound || [])
    .filter((r) => r.applicants?.status === 'active')
    .map((r) => r.applicant_id);
  if (applicantIds.length === 0) return { error: 'This round has no active applicants to assign.' };

  // "Assign new applicants only": keep current assignments, fill in anyone without a reviewer
  let initialLoad = {};
  if (onlyNew) {
    const existing = await fetchAll(() => supabase.from('assignments').select('applicant_id, member_id').eq('round_id', roundId).order('applicant_id').order('member_id'));
    const covered = new Set((existing || []).map((a) => a.applicant_id));
    (existing || []).forEach((a) => (initialLoad[a.member_id] = (initialLoad[a.member_id] || 0) + 1));
    applicantIds = applicantIds.filter((id) => !covered.has(id));
    if (applicantIds.length === 0) return { ok: 'Every applicant in this round already has a reviewer. Nothing to add.' };
  }

  const { data: conflictRows } = await supabase
    .from('conflicts')
    .select('applicant_id, member_id')
    .in('applicant_id', applicantIds);
  const blocked = new Set((conflictRows || []).map((c) => `${c.applicant_id}|${c.member_id}`));

  const { plan, load, short } = distribute(applicantIds, memberIds, perApplicant, blocked, Math.random, initialLoad, weights);

  if (!onlyNew) {
    const { error: clearError } = await supabase.from('assignments').delete().eq('round_id', roundId);
    if (clearError) return { error: `Couldn't clear old assignments: ${clearError.message}` };
  }

  const { error: insertError } = await supabase
    .from('assignments')
    .insert(plan.map((p) => ({ ...p, round_id: roundId })));
  if (insertError) return { error: `Couldn't save assignments: ${insertError.message}` };

  revalidatePath('/admin');
  revalidatePath('/');
  const loads = Object.values(load);
  const lo = Math.min(...loads);
  const hi = Math.max(...loads);
  const each = Math.min(perApplicant, memberIds.length);
  if (onlyNew) {
    return {
      ok:
        `Assigned ${applicantIds.length} new applicant${applicantIds.length === 1 ? '' : 's'}, ${each} reviewer${each === 1 ? '' : 's'} each. Existing assignments were kept; reviewers now have ${lo === hi ? lo : `${lo} to ${hi}`} total.` +
        (short.length ? ` ${short.length} got fewer reviewers because of conflicts.` : ''),
    };
  }
  return {
    ok:
      `Assigned ${applicantIds.length} applicants to ${memberIds.length} reviewers, ${each} per applicant. Each reviewer has ${lo === hi ? lo : `${lo} to ${hi}`}.` +
      (short.length
        ? ` ${short.length} applicant${short.length === 1 ? ' has' : 's have'} fewer reviewers because of conflicts; select more reviewers to fill ${short.length === 1 ? 'it' : 'them'}.`
        : ''),
  };
}

export async function applyCutoff(formData) {
  const { supabase } = await requireAdmin();
  const roundId = String(formData.get('roundId'));
  const cutoff = Number(formData.get('cutoff'));
  if (!(cutoff >= 0 && cutoff <= 5)) return;
  const { error } = await supabase.rpc('apply_cutoff', { p_round: roundId, p_cutoff: Math.round(cutoff * 100) / 100 });
  if (error) throw new Error(`Couldn't apply the cutoff: ${error.message}`);
  revalidatePath(`/rounds/${roundId}`);
  revalidatePath('/admin');
  revalidatePath('/');
}

// Removes every assignment in a round, plus any scores and notes entered for it.
// Only before voting opens (scores are deliberation context after that).
export async function clearAssignments(_prev, formData) {
  const { supabase } = await requireAdmin();
  const roundId = String(formData.get('roundId'));
  const { data: round } = await supabase.from('rounds').select('id, name, phase').eq('id', roundId).maybeSingle();
  if (!round) return { error: 'Round not found.' };
  if (!['setup', 'scoring'].includes(round.phase)) {
    return { error: `${round.name} is past scoring, so its assignments can't be cleared.` };
  }

  // Admin-verified above; the full-access client is needed to remove other members' scores and notes.
  const db = createAdminClient();
  const { data: crits } = await db.from('criteria').select('id').eq('round_id', roundId);
  const critIds = (crits || []).map((c) => c.id);
  if (critIds.length) {
    const { error } = await db.from('scores').delete().in('criterion_id', critIds);
    if (error) return { error: `Couldn't clear scores: ${error.message}` };
  }
  const { error: nErr } = await db.from('notes').delete().eq('round_id', roundId);
  if (nErr) return { error: `Couldn't clear notes: ${nErr.message}` };
  const { error: aErr } = await db.from('assignments').delete().eq('round_id', roundId);
  if (aErr) return { error: `Couldn't clear assignments: ${aErr.message}` };

  revalidatePath('/admin');
  revalidatePath('/');
  return { ok: `Cleared all assignments${critIds.length ? ', scores, and notes' : ''} for ${round.name}. Nobody is assigned now.` };
}

// ---------- Events (info sessions, case workshops) ----------
export async function createEvent(_prev, formData) {
  const { supabase } = await requireAdmin();
  const name = String(formData.get('name') || '').trim();
  const heldOn = String(formData.get('held_on') || '') || null;
  if (!name) return { error: 'Give the event a name.' };
  const { data: cycle } = await supabase.from('cycles').select('id').eq('is_active', true).maybeSingle();
  if (!cycle) return { error: 'No active cycle.' };
  const { error } = await supabase.from('events').insert({ cycle_id: cycle.id, name, held_on: heldOn });
  if (error) return { error: `Couldn't create the event: ${error.message}` };
  revalidatePath('/admin');
  return { ok: `Created ${name}. Upload its attendance sheet below.` };
}

export async function uploadAttendance(_prev, formData) {
  const { supabase } = await requireAdmin();
  const eventId = String(formData.get('eventId'));
  const file = formData.get('file');
  if (!file || typeof file === 'string' || !file.size) return { error: 'Choose a CSV or Excel file first.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'That file is over 5 MB. Export just the sign-in sheet as a CSV.' };
  if (!/\.(csv|xlsx)$/i.test(file.name)) return { error: 'Upload a .csv or .xlsx file (in Google Sheets: File → Download → CSV).' };

  const { extractAttendees } = await import('@/lib/attendance');
  const { attendees, error, emailCol, nameCol } = await extractAttendees(new Uint8Array(await file.arrayBuffer()), file.name);
  if (error) return { error };
  if (!attendees.length) return { error: 'No attendees found in that file.' };

  const { error: delErr } = await supabase.from('event_attendees').delete().eq('event_id', eventId);
  if (delErr) return { error: `Couldn't replace the old list: ${delErr.message}` };
  const rows = attendees.map((a) => ({ event_id: eventId, email: a.email || '', name: a.name }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error: insErr } = await supabase.from('event_attendees').upsert(rows.slice(i, i + 500), { onConflict: 'event_id,email,name', ignoreDuplicates: true });
    if (insErr) return { error: `Couldn't save attendees: ${insErr.message}` };
  }
  revalidatePath('/admin');
  revalidatePath('/');
  return {
    ok: `Saved ${attendees.length} attendee${attendees.length === 1 ? '' : 's'} (matched using ${[emailCol && `“${emailCol}”`, nameCol && `“${nameCol}”`].filter(Boolean).join(' and ')}). Applicants who attended now show a badge.`,
  };
}

export async function deleteEvent(formData) {
  const { supabase } = await requireAdmin();
  await supabase.from('events').delete().eq('id', String(formData.get('eventId')));
  revalidatePath('/admin');
  revalidatePath('/');
}
