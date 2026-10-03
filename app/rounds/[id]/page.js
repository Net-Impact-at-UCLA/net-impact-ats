import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import CutoffTool from '@/components/CutoffTool';
import RoundControls from '@/components/RoundControls';
import AutoRefresh from '@/components/AutoRefresh';
import PushAfterReleaseButton from '@/components/PushAfterReleaseButton';
import { getSession, fetchAll } from '@/lib/session';

const PHASE_LABEL = {
  setup: 'Not started',
  scoring: 'Scoring open',
  voting: 'Deliberation voting',
  closed: 'Voting closed',
  released: 'Results released',
};

export default async function RoundPage({ params }) {
  const { id } = await params;
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;
  const isAdmin = member.role === 'admin';

  const { data: round } = await supabase
    .from('rounds')
    .select('*, cycles(name)')
    .eq('id', id)
    .maybeSingle();
  if (!round) notFound();

  const { data: nextRound } = await supabase
    .from('rounds')
    .select('name')
    .eq('cycle_id', round.cycle_id)
    .gt('sort_order', round.sort_order)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  const byScores = round.decide_by === 'scores';
  let cutIds = new Set();
  if (round.phase === 'released') {
    const raRows = await fetchAll(() => supabase.from('round_applicants').select('*').eq('round_id', id).order('applicant_id'));
    cutIds = new Set(raRows.filter((x) => x.cut_override).map((x) => x.applicant_id));
  }
  const showDistribution = round.phase === 'closed' || (isAdmin && (round.phase === 'voting' || (byScores && round.phase === 'scoring')));
  const showResults = round.phase === 'released' || (isAdmin && ['voting', 'closed'].includes(round.phase)) || (isAdmin && byScores && round.phase === 'scoring');

  const [distRes, resultsRes] = await Promise.all([
    showDistribution ? supabase.rpc('vote_distribution', { p_round: id }) : Promise.resolve({ data: null }),
    showResults ? supabase.rpc('round_results', { p_round: id }) : Promise.resolve({ data: null }),
  ]);
  const distribution = (distRes.data || []).map((d) => ({ avg: d.avg_stars, votes: Number(d.vote_count), byVouch: !!d.by_vouch }));
  const results = resultsRes.data || [];

  // Voting progress (admins): how many applicants each member has voted on
  let progress = null;
  if (isAdmin && ['voting', 'closed'].includes(round.phase)) {
    const [{ data: roster }, votes, { data: conflicts }] = await Promise.all([
      supabase.from('members').select('id, full_name, email').eq('is_active', true).order('full_name'),
      fetchAll(() => supabase.from('votes').select('member_id, applicant_id').eq('round_id', id).order('member_id').order('applicant_id')),
      supabase.from('conflicts').select('member_id, applicant_id'),
    ]);
    const total = results.length;
    const inRound = new Set(results.map((r) => r.applicant_id));
    progress = (roster || []).map((m) => {
      const cast = (votes || []).filter((v) => v.member_id === m.id).length;
      const conflicted = (conflicts || []).filter((c) => c.member_id === m.id && inRound.has(c.applicant_id)).length;
      return { name: m.full_name || m.email, cast, of: total - conflicted };
    });
  }

  // Admin control bar stats
  let stats = null;
  if (isAdmin) {
    const [{ count: applicantCount }, asg, { data: crit }, { count: votesCast }] = await Promise.all([
      supabase.from('round_applicants').select('applicant_id', { count: 'exact', head: true }).eq('round_id', id),
      fetchAll(() => supabase.from('assignments').select('applicant_id, member_id').eq('round_id', id).order('applicant_id').order('member_id')),
      supabase.from('criteria').select('id').eq('round_id', id),
      supabase.from('votes').select('member_id', { count: 'exact', head: true }).eq('round_id', id),
    ]);
    const critIds = (crit || []).map((c) => c.id);
    const sc = critIds.length
      ? await fetchAll(() => supabase.from('scores').select('criterion_id, applicant_id, member_id').in('criterion_id', critIds).order('criterion_id').order('applicant_id').order('member_id'))
      : [];
    const have = {};
    (sc || []).forEach((x) => (have[`${x.applicant_id}|${x.member_id}`] = (have[`${x.applicant_id}|${x.member_id}`] || 0) + 1));
    const reviewsDone = (asg || []).filter((a) => critIds.length && (have[`${a.applicant_id}|${a.member_id}`] || 0) >= critIds.length).length;
    stats = { applicants: applicantCount || 0, assigned: (asg || []).length, reviewsDone, votesCast: votesCast || 0 };
  }

  return (
    <>
      <Header member={member} cycleName={round.cycles?.name} />
      <main className="page round-page">
        <Link href="/rounds" className="back">All rounds</Link>
        <div className="page-head">
          <h1>{round.name}</h1>
          <span className={`phase phase-${round.phase}`}>{PHASE_LABEL[round.phase]}</span>
          {['voting', 'closed'].includes(round.phase) && <AutoRefresh />}
        </div>

        {isAdmin && stats && <RoundControls round={round} nextRoundName={nextRound?.name} stats={stats} />}

        {!isAdmin && (round.phase === 'setup' || round.phase === 'scoring') ? (
          <div className="empty">
            <p>Deliberation voting hasn&apos;t opened for this round yet.</p>
          </div>
        ) : null}

        {round.phase === 'voting' && !isAdmin && (
          <div className="panel-lite">
            <h2>Voting is open</h2>
            <p className="muted">
              Vote on each applicant from the <Link href="/">Deliberation voting</Link> queue on the Applicants page. The
              anonymized results appear here when an admin closes voting.
            </p>
          </div>
        )}

        {showDistribution && (
          <section className="panel-lite">
            <h2>{byScores ? (round.phase === 'closed' ? 'Cut line' : 'Live preview') : round.phase === 'closed' ? 'Blind cutoff' : 'Live distribution'}</h2>
            <p className="muted panel-sub">
              {byScores
                ? round.phase === 'closed'
                  ? 'Each bar is one applicant’s average review score, highest first. Move the line, push through anyone the club wants to keep, then apply it.'
                  : 'Admins only, while scoring is open: where the line might fall based on scores so far. Pushing through and applying unlock when scoring closes.'
                : round.phase === 'closed'
                  ? 'Each bar is one applicant’s average vote, highest first. Names stay hidden until the cutoff is applied.'
                  : 'Visible to admins while voting is open. Members see this once voting closes.'}
            </p>
            {distribution.length ? (
              <CutoffTool
                roundId={round.id}
                roundName={round.name}
                nextRoundName={nextRound?.name}
                values={distribution}
                mode={byScores ? 'scores' : 'votes'}
                named={
                  isAdmin && byScores
                    ? results.map((r) => ({ id: r.applicant_id, name: r.full_name, avg: r.avg_stars, count: Number(r.vote_count), pushed: !!r.by_vouch }))
                    : null
                }
                canApply={isAdmin && round.phase === 'closed'}
              />
            ) : (
              <p className="muted">No applicants in this round.</p>
            )}
          </section>
        )}

        {progress && (
          <details className="panel-lite admin-only" open={round.phase === 'voting'}>
            <summary>
              <h2>Voting progress</h2> <span className="muted">(admins only)</span>
            </summary>
            <ul className="progress-list">
              {progress.map((p) => (
                <li key={p.name} className={p.cast >= p.of ? 'progress-done' : ''}>
                  <span>{p.name}</span>
                  <span className="muted">{p.cast} of {p.of}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {showResults && results.length > 0 && !(byScores && round.phase !== 'released') && (
          <ResultsTable
            cutIds={cutIds}
            byScores={byScores}
            canPush={isAdmin && round.phase === 'released'}
            roundId={round.id}
            nextRoundName={nextRound?.name}
            results={results}
            cutoff={round.cutoff}
            released={round.phase === 'released'}
            hidden={round.phase !== 'released'}
          />
        )}
      </main>
    </>
  );
}

function ResultsTable({ results, cutoff, released, hidden, byScores, canPush, roundId, nextRoundName, cutIds = new Set() }) {
  const fmt = (v) => (v == null ? '·' : Number(v).toFixed(2));
  const table = (
    <div className="table-wrap">
      <table className="table results-table">
        <thead>
          <tr>
            <th scope="col" className="num">#</th>
            <th scope="col">Applicant</th>
            <th scope="col" className="num">{byScores ? 'Avg review score' : 'Avg vote'}</th>
            <th scope="col" className="num">{byScores ? 'Reviewers' : 'Votes'}</th>
            {!byScores && <th scope="col" className="num">Recused</th>}
            {!byScores && <th scope="col" className="num">Reviewer avg</th>}
            {released && <th scope="col">Result</th>}
            {canPush && <th scope="col"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.applicant_id} className={released ? (r.advanced ? 'res-in' : 'res-out') : ''}>
              <td className="num muted">{i + 1}</td>
              <td>
                <Link href={`/applicants/${r.applicant_id}`}>{r.full_name}</Link>
                {!released && r.by_vouch && <span className="vouch-pill vouch-adv">Advancing: hard vouch</span>}
              </td>
              <td className="num"><strong>{fmt(r.avg_stars)}</strong></td>
              <td className="num">{r.vote_count}</td>
              {!byScores && <td className="num">{r.recusals}</td>}
              {!byScores && <td className="num">{fmt(r.avg_interview_score)}</td>}
              {released && <td>{r.advanced ? (r.by_vouch ? (byScores ? 'Advanced (pushed through)' : 'Advanced (hard vouch)') : 'Advanced') : cutIds.has(r.applicant_id) ? 'Not advanced (cut)' : 'Not advanced'}</td>}
              {canPush && (
                <td>
                  <PushAfterReleaseButton
                    roundId={roundId}
                    applicantId={r.applicant_id}
                    name={r.full_name}
                    nextRoundName={nextRoundName}
                    state={r.advanced ? (r.by_vouch ? 'pushed' : 'advanced') : cutIds.has(r.applicant_id) ? 'cut' : 'out'}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (hidden) {
    return (
      <details className="panel-lite admin-only">
        <summary>
          <h2>Named results</h2> <span className="muted">(admins only; keep closed while projecting the cutoff)</span>
        </summary>
        {table}
      </details>
    );
  }
  return (
    <section className="panel-lite">
      <h2>Results</h2>
      <p className="muted panel-sub">{byScores ? 'Cut line' : 'Cutoff'} applied: {fmt(cutoff)}. Advancing applicants have moved to the next round.</p>
      {table}
    </section>
  );
}
