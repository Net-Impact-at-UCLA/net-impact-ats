import { getActiveCycle, signedUrls } from '@/lib/session';

// Loads the round currently in deliberation voting and everyone in it, with the
// context shown on the TV (scores + notes per member, vouch counts).
// Never includes private applicant info or anyone's votes.
export async function loadDeliberation(supabase) {
  const cycle = await getActiveCycle(supabase);
  if (!cycle) return { cycle: null, round: null };
  const { data: round } = await supabase
    .from('rounds')
    .select('id, name, stage, phase, sort_order')
    .eq('cycle_id', cycle.id)
    .eq('phase', 'voting')
    .order('sort_order')
    .limit(1)
    .maybeSingle();
  if (!round) return { cycle, round: null };

  const [{ data: inRound }, { data: criteria }, { data: vouchRows }, { data: roster }] = await Promise.all([
    supabase
      .from('round_applicants')
      .select('applicant_id, applicants(id, full_name, pronouns, majors, grad_year, headshot_path, status)')
      .eq('round_id', round.id),
    supabase.from('criteria').select('id, name, sort_order').eq('round_id', round.id).order('sort_order'),
    supabase.rpc('vouch_counts', { p_cycle: cycle.id }),
    supabase.from('members').select('id, full_name, email'),
  ]);

  const people = (inRound || [])
    .map((x) => x.applicants)
    .filter((a) => a && a.status === 'active')
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const urls = await signedUrls(supabase, people.map((p) => p.headshot_path));
  const vouches = Object.fromEntries((vouchRows || []).map((v) => [v.applicant_id, Number(v.vouch_count)]));

  const applicants = people.map((p) => ({
    id: p.id,
    name: p.full_name,
    pronouns: p.pronouns,
    detail: [p.grad_year && `Class of ${p.grad_year}`, p.majors].filter(Boolean).join(', '),
    headshot: urls[p.headshot_path] || null,
    vouches: vouches[p.id] || 0,
  }));

  return { cycle, round, criteria: criteria || [], applicants, roster: roster || [] };
}

// Scores and notes from this round, grouped per applicant (for the TV spotlight).
export async function loadContext(supabase, round, criteria, roster) {
  const critIds = criteria.map((c) => c.id);
  const [{ data: scores }, { data: notes }] = await Promise.all([
    critIds.length
      ? supabase.from('scores').select('criterion_id, applicant_id, member_id, score').in('criterion_id', critIds)
      : Promise.resolve({ data: [] }),
    supabase.from('notes').select('applicant_id, member_id, criterion_id, body').eq('round_id', round.id),
  ]);
  const nameOf = Object.fromEntries(roster.map((m) => [m.id, m.full_name || m.email]));
  const ctx = {};
  const get = (aid, mid) => {
    const a = (ctx[aid] ??= {});
    return (a[mid] ??= { name: nameOf[mid] || 'Former member', scores: {}, notes: [] });
  };
  (scores || []).forEach((s) => (get(s.applicant_id, s.member_id).scores[s.criterion_id] = Number(s.score)));
  (notes || []).forEach((n) => {
    if (!n.body) return;
    const label = n.criterion_id ? criteria.find((c) => c.id === n.criterion_id)?.name : null;
    get(n.applicant_id, n.member_id).notes.push(label ? `${label}: ${n.body}` : n.body);
  });
  // -> { applicantId: [{ name, scores, notes }] }
  return Object.fromEntries(
    Object.entries(ctx).map(([aid, byMember]) => [aid, Object.values(byMember).sort((x, y) => x.name.localeCompare(y.name))])
  );
}
