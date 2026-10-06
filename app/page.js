import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import ApplicantList from '@/components/ApplicantList';
import Queue from '@/components/Queue';
import { getSession, getActiveCycle, signedUrls, fetchAll } from '@/lib/session';
import { withProgress } from '@/lib/applicants';

export default async function Home({ searchParams }) {
  const { removed } = await searchParams;
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
  const roundApplicants = roundIds.length
    ? await fetchAll(() => supabase.from('round_applicants').select('*').in('round_id', roundIds).order('round_id').order('applicant_id'))
    : [];
  const coffeeRound = (rounds || []).find((r) => r.stage === 'coffee_chat');
  const makeupPending = new Set(
    roundApplicants.filter((x) => coffeeRound && x.round_id === coffeeRound.id && x.makeup && x.advanced == null).map((x) => x.applicant_id)
  );

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
      .map((a) => {
        const scored = have[`${a.round_id}|${a.applicant_id}`] || 0;
        const total = need[a.round_id] || 0;
        const done = total > 0 && scored >= total;
        const round = openRounds.find((r) => r.id === a.round_id);
        const roundName = round?.name;
        return {
          key: `${a.round_id}-${a.applicant_id}`,
          href: round?.stage === 'coffee_chat' ? '/table' : undefined,
          applicantId: a.applicant_id,
          name: byId[a.applicant_id].full_name,
          done,
          meta: `${roundName}, ${done ? 'done' : scored ? `${scored} of ${total} scored` : 'not started'}`,
        };
      })
      .sort((x, y) => x.done - y.done || x.name.localeCompare(y.name));
  }

  const [{ data: vouchRows }, { data: eventList }, { data: attRows }] = await Promise.all([
    supabase.rpc('vouch_counts', { p_cycle: cycle.id }),
    supabase.from('events').select('id, name, created_at').eq('cycle_id', cycle.id).order('created_at'),
    supabase.rpc('attendance', { p_cycle: cycle.id }),
  ]);
  const attendedBy = {};
  (attRows || []).forEach((r) => (attendedBy[r.applicant_id] ??= []).push(r.event_id));
  const vouchCount = Object.fromEntries((vouchRows || []).map((v) => [v.applicant_id, Number(v.vouch_count)]));

  // Deliberation voting queue: everyone in a round that's open for voting
  const votingRounds = (rounds || []).filter((r) => r.phase === 'voting');
  let voteQueue = [];
  if (votingRounds.length) {
    const vIds = votingRounds.map((r) => r.id);
    const [{ data: inVote }, { data: myVotes }, { data: myConflicts }] = await Promise.all([
      supabase.from('round_applicants').select('*').in('round_id', vIds),
      supabase.from('votes').select('round_id, applicant_id, stars, recused').eq('member_id', member.id).in('round_id', vIds),
      supabase.from('conflicts').select('applicant_id').eq('member_id', member.id),
    ]);
    const byIdV = Object.fromEntries((applicants || []).map((a) => [a.id, a]));
    const conflictSet = new Set((myConflicts || []).map((c) => c.applicant_id));
    const voteOf = Object.fromEntries((myVotes || []).map((v) => [`${v.round_id}|${v.applicant_id}`, v]));
    voteQueue = (inVote || [])
      .filter((x) => !x.makeup && byIdV[x.applicant_id]?.status === 'active' && !conflictSet.has(x.applicant_id))
      .map((x) => {
        const v = voteOf[`${x.round_id}|${x.applicant_id}`];
        const roundName = votingRounds.find((r) => r.id === x.round_id)?.name;
        return {
          key: `v-${x.round_id}-${x.applicant_id}`,
          href: '/deliberate',
          applicantId: x.applicant_id,
          name: byIdV[x.applicant_id].full_name,
          done: !!v,
          meta: `${roundName}, ${v ? (v.recused ? 'recused' : `voted ${Number(v.stars)}`) : 'not voted'}`,
        };
      })
      .sort((x, y) => x.done - y.done || x.name.localeCompare(y.name));
  }

  // Admins: how many reviews each applicant has in their current round
  let reviewCounts = {};
  if (member.role === 'admin' && roundIds.length) {
    const [allAsg, allCrit] = await Promise.all([
      fetchAll(() => supabase.from('assignments').select('round_id, applicant_id, member_id').in('round_id', roundIds).order('round_id').order('applicant_id').order('member_id')),
      fetchAll(() => supabase.from('criteria').select('id, round_id').in('round_id', roundIds)),
    ]);
    const critIds = allCrit.map((c) => c.id);
    const allScores = critIds.length
      ? await fetchAll(() => supabase.from('scores').select('criterion_id, applicant_id, member_id, score').in('criterion_id', critIds).order('criterion_id').order('applicant_id').order('member_id'))
      : [];
    const roundOfCrit = Object.fromEntries(allCrit.map((c) => [c.id, c.round_id]));
    const need = {};
    allCrit.forEach((c) => (need[c.round_id] = (need[c.round_id] || 0) + 1));
    const scored = {};
    const sums = {};
    allScores.forEach((x) => {
      const k = `${roundOfCrit[x.criterion_id]}|${x.applicant_id}|${x.member_id}`;
      scored[k] = (scored[k] || 0) + 1;
      const ak = `${roundOfCrit[x.criterion_id]}|${x.applicant_id}`;
      const t = (sums[ak] ??= { total: 0, n: 0 });
      t.total += Number(x.score);
      t.n += 1;
    });
    allAsg.forEach((a) => {
      const c = (reviewCounts[`${a.round_id}|${a.applicant_id}`] ??= { assigned: 0, done: 0, started: 0 });
      c.assigned += 1;
      const n = scored[`${a.round_id}|${a.applicant_id}|${a.member_id}`] || 0;
      if (need[a.round_id] && n >= need[a.round_id]) c.done += 1;
      else if (n > 0) c.started += 1;
    });
    Object.entries(sums).forEach(([k, t]) => {
      const c = (reviewCounts[k] ??= { assigned: 0, done: 0, started: 0 });
      c.avg = t.n ? Math.round((t.total / t.n) * 100) / 100 : null;
    });
  }

  const urls = await signedUrls(supabase, (applicants || []).map((a) => a.headshot_path));
  const list = withProgress(applicants || [], rounds || [], roundApplicants || []).map((a) => ({
    ...a,
    headshotUrl: urls[a.headshot_path] || null,
    vouches: vouchCount[a.id] || 0,
    makeup: makeupPending.has(a.id),
    reviews:
      member.role === 'admin'
        ? reviewCounts[`${a.currentRoundId}|${a.id}`] || { assigned: 0, done: 0, started: 0 }
        : null,
    events: attendedBy[a.id] || [],
  }));

  return (
    <>
      <Header member={member} cycleName={cycle.name} />
      <main className="page">
        {removed && <p className="flash" role="status">Applicant removed.</p>}
        <div className="page-head">
          <h1>Applicants</h1>
          <p className="page-sub">{list.length} in {cycle.name}</p>
        </div>
        {voteQueue.length > 0 && <Queue title="Deliberation voting" items={voteQueue} doneLabel="voted" tone="vote" />}
        {(() => {
          const reviewRound = [...(rounds || [])].filter((r) => r.phase === 'scoring' && r.stage !== 'coffee_chat').sort((a, b) => b.sort_order - a.sort_order)[0];
          return queue.length > 0 || reviewRound ? (
            <Queue title="Your review queue" items={queue} reviewMore={reviewRound ? { id: reviewRound.id, name: reviewRound.name } : null} />
          ) : null;
        })()}
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
          <ApplicantList applicants={list} rounds={rounds || []} events={eventList || []} />
        )}
      </main>
    </>
  );
}
