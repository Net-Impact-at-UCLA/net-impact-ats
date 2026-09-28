'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';

// Admin only (also enforced by the database's security rules).
// Deletes the applicant, everything attached to them, and their files.
export async function removeApplicant(formData) {
  const { supabase, member } = await getSession();
  if (member?.role !== 'admin') throw new Error('Only admins can remove applicants.');

  const id = String(formData.get('id'));
  const { data: applicant } = await supabase
    .from('applicants')
    .select('id, headshot_path, resume_path')
    .eq('id', id)
    .maybeSingle();
  if (!applicant) redirect('/');

  const files = [applicant.headshot_path, applicant.resume_path].filter(Boolean);
  if (files.length) await supabase.storage.from('applicant-files').remove(files);

  const { error } = await supabase.from('applicants').delete().eq('id', id);
  if (error) throw new Error(`Couldn't remove applicant: ${error.message}`);

  revalidatePath('/');
  revalidatePath('/admin');
  redirect('/?removed=1');
}
