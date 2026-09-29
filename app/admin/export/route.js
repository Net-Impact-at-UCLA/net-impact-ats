import { NextResponse } from 'next/server';
import { getSession, getActiveCycle } from '@/lib/session';
import { buildWorkbook } from '@/lib/export';

export const runtime = 'nodejs';

// Admin-only Excel download of everything in the active cycle.
export async function GET() {
  const { supabase, member } = await getSession();
  if (member?.role !== 'admin') return NextResponse.json({ error: 'Admins only' }, { status: 403 });

  const cycle = await getActiveCycle(supabase);
  if (!cycle) return NextResponse.json({ error: 'No active cycle' }, { status: 404 });

  const { data: rounds } = await supabase.from('rounds').select('id, name, stage, phase, sort_order, cutoff').eq('cycle_id', cycle.id).order('sort_order');
  const roundIds = (rounds || []).map((r) => r.id);
  const { data: applicants } = await supabase.from('applicants').select('*').eq('cycle_id', cycle.id);
  const appIds = (applicants || []).map((a) => a.id);

  // Supabase caps each request at 1,000 rows, so page through everything.
  async function all(build) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) return out;
    }
  }
  const none = [];
  const [criteria, roundApplicants, scores, notes, votes, vouches, conflicts, privates, members] = await Promise.all([
    roundIds.length ? all(() => supabase.from('criteria').select('id, round_id, name, sort_order').in('round_id', roundIds)) : none,
    roundIds.length ? all(() => supabase.from('round_applicants').select('round_id, applicant_id, advanced').in('round_id', roundIds)) : none,
    appIds.length ? all(() => supabase.from('scores').select('criterion_id, applicant_id, member_id, score, updated_at').in('applicant_id', appIds)) : none,
    roundIds.length ? all(() => supabase.from('notes').select('round_id, applicant_id, member_id, criterion_id, body, updated_at').in('round_id', roundIds)) : none,
    roundIds.length ? all(() => supabase.from('votes').select('round_id, applicant_id, member_id, stars, recused, updated_at').in('round_id', roundIds)) : none,
    appIds.length ? all(() => supabase.from('vouches').select('applicant_id, member_id, reason, created_at').in('applicant_id', appIds)) : none,
    appIds.length ? all(() => supabase.from('conflicts').select('applicant_id, member_id, created_at').in('applicant_id', appIds)) : none,
    appIds.length ? all(() => supabase.from('applicant_private').select('*').in('applicant_id', appIds)) : none,
    all(() => supabase.from('members').select('id, full_name, email')),
  ]);

  const buffer = await buildWorkbook({
    rounds: rounds || [], applicants: applicants || [], criteria, roundApplicants, scores, notes, votes, vouches, conflicts, privates, members,
  });

  const today = new Date().toISOString().slice(0, 10);
  const filename = `NI-ATS-${cycle.name.replace(/[^A-Za-z0-9]+/g, '-')}-${today}.xlsx`;
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
