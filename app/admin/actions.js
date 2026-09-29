'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { distribute } from '@/lib/distribute';

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
    const { data: existing } = await supabase.from('assignments').select('applicant_id, member_id').eq('round_id', roundId);
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

  const { plan, load, short } = distribute(applicantIds, memberIds, perApplicant, blocked, Math.random, initialLoad);

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
