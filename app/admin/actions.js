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
  if (!['setup', 'scoring'].includes(phase)) return;
  await supabase.from('rounds').update({ phase }).eq('id', roundId);
  revalidatePath('/admin');
  revalidatePath('/');
}

export async function distributeReviewers(_prev, formData) {
  const { supabase } = await requireAdmin();
  const roundId = String(formData.get('roundId'));
  const memberIds = formData.getAll('memberIds').map(String);
  const perApplicant = Math.max(1, parseInt(formData.get('perApplicant'), 10) || 1);

  if (memberIds.length === 0) return { error: 'Select at least one member.' };

  const { data: inRound, error: readError } = await supabase
    .from('round_applicants')
    .select('applicant_id, applicants(status)')
    .eq('round_id', roundId);
  if (readError) return { error: `Couldn't read applicants: ${readError.message}` };

  const applicantIds = (inRound || [])
    .filter((r) => r.applicants?.status === 'active')
    .map((r) => r.applicant_id);
  if (applicantIds.length === 0) return { error: 'This round has no active applicants to assign.' };

  const { plan, load } = distribute(applicantIds, memberIds, perApplicant);

  const { error: clearError } = await supabase.from('assignments').delete().eq('round_id', roundId);
  if (clearError) return { error: `Couldn't clear old assignments: ${clearError.message}` };

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
  return {
    ok: `Assigned ${applicantIds.length} applicants to ${memberIds.length} reviewers, ${each} per applicant. Each reviewer has ${lo === hi ? lo : `${lo} to ${hi}`}.`,
  };
}
