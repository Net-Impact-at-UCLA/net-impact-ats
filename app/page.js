import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import ApplicantList from '@/components/ApplicantList';
import Queue from '@/components/Queue';
import { getSession, getActiveCycle, signedUrls } from '@/lib/session';
import { withProgress } from '@/lib/applicants';

export default async function Home() {
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;

  const cycle = await getActiveCycle(supabase);

  if (!cycle) {
    return (
      <>
        <Header member={member} />
        <main className="page">
          <div className="empty">
            <h1>No recruitment cycle is running</h1>
            <p>
              {member.role === 'admin'
                ? 'Create a cycle and import applicants to get started.'
                : 'Applicants will show up here once the exec board opens a recruitment cycle.'}
            </p>
          </div>
        </main>
      </>
    );
  }

  const [{ data: rounds }, { data: applicants }] = await Promise.all([
    supabase.from('rounds').select('id, name, stage, phase, sort_order').eq('cycle_id', cycle.id).order('sort_order'),
    supabase
      .from('applicants')
      .select('id, full_name, pronouns, majors, gpa, grad_year, headshot_path, status')
      .eq('cycle_id', cycle.id)
      .order('full_name'),
  ]);

  const roundIds = (rounds || []).map((r) => r.id);
  const { data: roundApplicants } = roundIds.length
    ? await supabase.from('round_applicants').select('round_id, applicant_id').in('round_id', roundIds)
    : { data: [] };

  // This member's review queue: assignments in rounds that are open for scoring
  const openRounds = (rounds || []).filter((r) => r.phase === 'scoring');
  let queue = [];
  if (openRounds.length) {
    const openIds = openRounds.map((r) => r.id);
    const [{ data: mine }, { data: criteria }] = await Promise.all([
      supabase.from('assignments').select('round_id, applicant_id').eq('member_id', member.id).in('round_id', openIds),
      supabase.from('criteria').select('id, round_id').in('round_id', openIds),
    ]);
    const criteriaIds = (criteria || []).map((c) => c.id);
    const { data: myScores } = criteriaIds.length
      ? await supabase.from('scores').select('criterion_id, applicant_id').eq('member_id', member.id).in('criterion_id', criteriaIds)
      : { data: [] };
    const roundOf = Object.fromEntries((criteria || []).map((c) => [c.id, c.round_id]));
    const need = {};
    (criteria || []).forEach((c) => (need[c.round_id] = (need[c.round_id] || 0) + 1));
    const have = {};
    (myScores || []).forEach((s) => {
      const k = `${roundOf[s.criterion_id]}|${s.applicant_id}`;
      have[k] = (have[k] || 0) + 1;
    });
    const byId = Object.fromEntries((applicants || []).map((a) => [a.id, a]));
    queue = (mine || [])
      .filter((a) => byId[a.applicant_id])
      .map((a) => ({
        applicantId: a.applicant_id,
        name: byId[a.applicant_id].full_name,
        roundName: openRounds.find((r) => r.id === a.round_id)?.name,
        scored: have[`${a.round_id}|${a.applicant_id}`] || 0,
        total: need[a.round_id] || 0,
      }))
      .sort((x, y) => (x.scored >= x.total) - (y.scored >= y.total) || x.name.localeCompare(y.name));
  }

  const urls = await signedUrls(supabase, (applicants || []).map((a) => a.headshot_path));
  const list = withProgress(applicants || [], rounds || [], roundApplicants || []).map((a) => ({
    ...a,
    headshotUrl: urls[a.headshot_path] || null,
  }));

  return (
    <>
      <Header member={member} cycleName={cycle.name} />
      <main className="page">
        <div className="page-head">
          <h1>Applicants</h1>
          <p className="page-sub">{list.length} in {cycle.name}</p>
        </div>
        {queue.length > 0 && <Queue items={queue} />}
        {list.length === 0 ? (
          <div className="empty">
            <h2>No applicants yet</h2>
            <p>
              {member.role === 'admin'
                ? 'Import applicants from the application Google Sheet to fill this list.'
                : 'Applicants will appear here once the exec board imports them.'}
            </p>
          </div>
        ) : (
          <ApplicantList applicants={list} rounds={rounds || []} />
        )}
      </main>
    </>
  );
}
