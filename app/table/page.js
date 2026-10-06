import Link from 'next/link';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import TableBoard from '@/components/TableBoard';
import { getSession, getActiveCycle, signedUrls } from '@/lib/session';

export const metadata = { title: 'My table · Net Impact ATS' };

export default async function TablePage() {
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;
  const cycle = await getActiveCycle(supabase);

  const { data: allRounds } = cycle
    ? await supabase.from('rounds').select('*').eq('cycle_id', cycle.id).order('sort_order')
    : { data: [] };
  const isSelf = (r) => (r.self_select ?? r.stage === 'coffee_chat');
  // The latest self-pick round with scoring open; otherwise Coffee Chats (for makeups)
  const round =
    [...(allRounds || [])].filter((r) => isSelf(r) && r.phase === 'scoring').pop() ||
    (allRounds || []).find((r) => r.stage === 'coffee_chat') ||
    null;

  // After scoring closes, the table stays open for makeup coffee chats only
  let makeupIds = null;
  if (round && round.stage === 'coffee_chat' && ['voting', 'closed', 'released'].includes(round.phase)) {
    const { data: mk } = await supabase.from('round_applicants').select('*').eq('round_id', round.id).eq('makeup', true);
    makeupIds = new Set((mk || []).filter((x) => x.advanced == null).map((x) => x.applicant_id));
  }
  const makeupsOnly = makeupIds != null;

  if (!round || (round.phase !== 'scoring' && !(makeupsOnly && makeupIds.size))) {
    return (
      <>
        <Header member={member} cycleName={cycle?.name} />
        <main className="page">
          <div className="empty">
            <h1>My table</h1>
            <p>This page opens when an admin starts scoring for a round where members pick who they grade (like Coffee Chats or R1).</p>
            <p><Link href="/">Back to applicants</Link></p>
          </div>
        </main>
      </>
    );
  }

  const [{ data: criteria }, { data: inRound }, { data: mine }, { data: myConflicts }] = await Promise.all([
    supabase.from('criteria').select('id, name, min_score, max_score, sort_order').eq('round_id', round.id).order('sort_order'),
    supabase.from('round_applicants').select('*, applicants(id, full_name, pronouns, majors, grad_year, headshot_path, status)').eq('round_id', round.id),
    supabase.from('assignments').select('applicant_id, group_no, added_at').eq('round_id', round.id).eq('member_id', member.id),
    supabase.from('conflicts').select('applicant_id').eq('member_id', member.id),
  ]);
  const critIds = (criteria || []).map((c) => c.id);
  const [{ data: myScores }, { data: myNotes }] = await Promise.all([
    critIds.length
      ? supabase.from('scores').select('criterion_id, applicant_id, score').eq('member_id', member.id).in('criterion_id', critIds)
      : Promise.resolve({ data: [] }),
    supabase.from('notes').select('applicant_id, criterion_id, body').eq('member_id', member.id).eq('round_id', round.id),
  ]);

  const people = (inRound || [])
    .filter((x) => !makeupsOnly || makeupIds.has(x.applicant_id))
    .map((x) => x.applicants)
    .filter((a) => a && a.status === 'active')
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const urls = await signedUrls(supabase, people.map((p) => p.headshot_path));
  const conflictIds = (myConflicts || []).map((c) => c.applicant_id);

  const applicants = people.map((p) => ({
    id: p.id,
    name: p.full_name,
    pronouns: p.pronouns,
    detail: [p.grad_year && `Class of ${p.grad_year}`, p.majors].filter(Boolean).join(', '),
    headshot: urls[p.headshot_path] || null,
    conflict: conflictIds.includes(p.id),
  }));

  const entries = (mine || []).filter((m) => !makeupsOnly || makeupIds.has(m.applicant_id)).map((m) => {
    const scores = {};
    (myScores || []).filter((s) => s.applicant_id === m.applicant_id).forEach((s) => (scores[s.criterion_id] = Number(s.score)));
    const notes = (myNotes || []).find((n) => n.applicant_id === m.applicant_id && !n.criterion_id)?.body || '';
    return { applicantId: m.applicant_id, group: m.group_no || 1, addedAt: m.added_at, scores, notes };
  });

  return (
    <>
      <Header member={member} cycleName={cycle?.name} />
      <main className="page table-page">
        {makeupsOnly && (
          <p className="makeup-banner">
            <span className="makeup-pill">Makeup coffee chats</span> Regular scoring is closed. Only applicants doing a makeup chat can be added and graded here.
          </p>
        )}
        <TableBoard round={round} criteria={criteria || []} applicants={applicants} initialEntries={entries} memberId={member.id} />
      </main>
    </>
  );
}
