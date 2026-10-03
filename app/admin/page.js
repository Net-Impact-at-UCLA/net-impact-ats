import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import RosterForm from '@/components/admin/RosterForm';
import DistributeForm from '@/components/admin/DistributeForm';
import GraderChart from '@/components/admin/GraderChart';
import ConfirmButton from '@/components/ConfirmButton';
import EventsPanel from '@/components/admin/EventsPanel';
import { getSession, getActiveCycle } from '@/lib/session';
import { updateMember, setRoundPhase } from './actions';

export const metadata = { title: 'Admin · Net Impact ATS' };

const PHASE_LABEL = {
  setup: 'Not started',
  scoring: 'Scoring open',
  voting: 'Deliberation voting',
  closed: 'Voting closed',
  released: 'Results released',
};

export default async function AdminPage() {
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;
  if (member.role !== 'admin') redirect('/');

  const cycle = await getActiveCycle(supabase);
  const { data: allMembers } = await supabase
    .from('members')
    .select('*')
    .order('full_name', { nullsFirst: false });
  const activeMembers = (allMembers || []).filter((m) => m.is_active);
  const removedMembers = (allMembers || []).filter((m) => !m.is_active);

  let rounds = [];
  let progress = {};
  let eventRows = [];
  let applicantTotal = 0;
  let graderTables = [];
  let conflictRows = [];
  if (cycle) {
    const { data: roundRows } = await supabase
      .from('rounds')
      .select('id, name, stage, phase, sort_order')
      .eq('cycle_id', cycle.id)
      .order('sort_order');
    const roundIds = (roundRows || []).map((r) => r.id);

    const [{ data: ra }, { data: assignments }, { data: criteria }] = await Promise.all([
      supabase.from('round_applicants').select('round_id, applicant_id, applicants(status)').in('round_id', roundIds),
      supabase.from('assignments').select('round_id, applicant_id, member_id').in('round_id', roundIds),
      supabase.from('criteria').select('id, round_id').in('round_id', roundIds),
    ]);
    const criteriaIds = (criteria || []).map((c) => c.id);
    const { data: scores } = criteriaIds.length
      ? await supabase.from('scores').select('criterion_id, applicant_id, member_id, score').in('criterion_id', criteriaIds)
      : { data: [] };

    const criteriaByRound = {};
    (criteria || []).forEach((c) => (criteriaByRound[c.round_id] ??= new Set()).add(c.id));
    const roundOfCriterion = Object.fromEntries((criteria || []).map((c) => [c.id, c.round_id]));

    // How many criteria each member has scored per applicant per round
    const scoredCount = {};
    (scores || []).forEach((s) => {
      const key = `${roundOfCriterion[s.criterion_id]}|${s.applicant_id}|${s.member_id}`;
      scoredCount[key] = (scoredCount[key] || 0) + 1;
    });

    (assignments || []).forEach((a) => {
      const need = criteriaByRound[a.round_id]?.size || 0;
      const done = need > 0 && (scoredCount[`${a.round_id}|${a.applicant_id}|${a.member_id}`] || 0) >= need;
      const p = ((progress[a.round_id] ??= {})[a.member_id] ??= { assigned: 0, done: 0 });
      p.assigned += 1;
      if (done) p.done += 1;
    });

    // Grader averages: each reviewer's mean score per round vs. the club's mean
    const nameOf = Object.fromEntries((allMembers || []).map((m) => [m.id, m.full_name || m.email]));
    graderTables = (roundRows || [])
      .map((r) => {
        const rs = (scores || []).filter((s) => roundOfCriterion[s.criterion_id] === r.id);
        if (!rs.length) return null;
        const clubAvg = rs.reduce((n, s) => n + Number(s.score), 0) / rs.length;
        const byMember = {};
        rs.forEach((s) => {
          const m = (byMember[s.member_id] ??= { total: 0, count: 0, applicants: new Set() });
          m.total += Number(s.score);
          m.count += 1;
          m.applicants.add(s.applicant_id);
        });
        const rows = Object.entries(byMember)
          .map(([id, m]) => ({ id, name: nameOf[id] || 'Unknown', avg: m.total / m.count, diff: m.total / m.count - clubAvg, applicants: m.applicants.size, scores: m.count }))
          .sort((a, b) => b.avg - a.avg);
        return { round: r, clubAvg, rows };
      })
      .filter(Boolean);

    // Conflicts, with how many reviewers each conflicted applicant has left in open rounds
    const { data: cRows } = await supabase
      .from('conflicts')
      .select('applicant_id, member_id, created_at, applicants!inner(full_name, cycle_id)')
      .eq('applicants.cycle_id', cycle.id)
      .order('created_at', { ascending: false });
    const openRoundIds = (roundRows || []).filter((r) => r.phase === 'setup' || r.phase === 'scoring').map((r) => r.id);
    conflictRows = (cRows || []).map((c) => {
      const reviewerCounts = openRoundIds
        .map((rid) => {
          const n = (assignments || []).filter((a) => a.round_id === rid && a.applicant_id === c.applicant_id).length;
          const inRound = (ra || []).some((x) => x.round_id === rid && x.applicant_id === c.applicant_id);
          return inRound && (assignments || []).some((a) => a.round_id === rid) ? { round: roundRows.find((r) => r.id === rid).name, n } : null;
        })
        .filter(Boolean);
      return { ...c, memberName: nameOf[c.member_id] || 'Unknown', reviewerCounts };
    });

    // Events + how many applicants each matched
    const [{ data: evs }, { data: att }, { data: attendeeRows }, { count: appCount }] = await Promise.all([
      supabase.from('events').select('id, name, held_on, created_at').eq('cycle_id', cycle.id).order('created_at'),
      supabase.rpc('attendance', { p_cycle: cycle.id }),
      supabase.from('event_attendees').select('event_id'),
      supabase.from('applicants').select('id', { count: 'exact', head: true }).eq('cycle_id', cycle.id),
    ]);
    applicantTotal = appCount || 0;
    eventRows = (evs || []).map((e) => ({
      ...e,
      attendeeCount: (attendeeRows || []).filter((a) => a.event_id === e.id).length,
      matchedCount: (att || []).filter((a) => a.event_id === e.id).length,
    }));

    rounds = (roundRows || []).map((r) => ({
      ...r,
      activeCount: (ra || []).filter((x) => x.round_id === r.id && x.applicants?.status === 'active').length,
      unassignedCount: (ra || []).filter(
        (x) => x.round_id === r.id && x.applicants?.status === 'active' &&
          !(assignments || []).some((a) => a.round_id === r.id && a.applicant_id === x.applicant_id)
      ).length,
      assignedCount: (assignments || []).filter((x) => x.round_id === r.id).length,
      scoredCount: (scores || []).filter((s) => roundOfCriterion[s.criterion_id] === r.id).length,
      doneCount: Object.values(progress[r.id] || {}).reduce((n, p) => n + p.done, 0),
    }));
  }

  return (
    <>
      <Header member={member} cycleName={cycle?.name} />
      <main className="page admin">
        <div className="page-head">
          <h1>Admin</h1>
        </div>

        {cycle ? (
          <>
            <section className="panel">
              <h2>Rounds</h2>
              <p className="muted panel-sub">
                Open scoring when reviewers are assigned. Members can only score while a round is open.
              </p>
              <ul className="round-list">
                {rounds.map((r) => (
                  <li key={r.id} className="round-row">
                    <a href={`/rounds/${r.id}`} className="round-name">{r.name}</a>
                    <span className={`phase phase-${r.phase}`}>{PHASE_LABEL[r.phase]}</span>
                    <span className="round-meta">
                      {r.activeCount} active
                      {r.assignedCount > 0 && `, ${r.doneCount} of ${r.assignedCount} reviews done`}
                    </span>
                    <span className="round-actions">
                      {r.phase === 'setup' && (
                        <PhaseButton id={r.id} to="scoring" primary disabled={r.assignedCount === 0 && r.stage !== 'coffee_chat'}>
                          Open scoring
                        </PhaseButton>
                      )}
                      {r.phase === 'scoring' && (
                        <>
                          <PhaseButton id={r.id} to="setup">Pause scoring</PhaseButton>
                          <PhaseButton id={r.id} to="voting" primary confirm={`Open deliberation voting for ${r.name}? Scoring closes, and every member can see reviewers' scores and notes and vote.`}>
                            Open voting
                          </PhaseButton>
                        </>
                      )}
                      {r.phase === 'voting' && (
                        <>
                          <PhaseButton id={r.id} to="scoring">Back to scoring</PhaseButton>
                          <PhaseButton id={r.id} to="closed" primary confirm={`Close voting for ${r.name}? Members will see the anonymized score distribution for the blind cutoff.`}>
                            Close voting
                          </PhaseButton>
                        </>
                      )}
                      {r.phase === 'closed' && <PhaseButton id={r.id} to="voting">Reopen voting</PhaseButton>}
                      {['voting', 'closed', 'released'].includes(r.phase) && (
                        <a href={`/rounds/${r.id}`} className="btn btn-quiet">
                          {r.phase === 'closed' ? 'Set cutoff' : r.phase === 'released' ? 'Results' : 'Live votes'}
                        </a>
                      )}
                    </span>
                    {r.unassignedCount > 0 && r.assignedCount > 0 && r.stage !== 'coffee_chat' && ['setup', 'scoring'].includes(r.phase) && (
                      <span className="round-warn">
                        {r.unassignedCount} applicant{r.unassignedCount === 1 ? '' : 's'} without a reviewer. Use Assign reviewers below.
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h2>Assign reviewers</h2>
              <p className="muted panel-sub">
                Pick the members reviewing this round and the app spreads applicants evenly between them.
              </p>
              {activeMembers.length === 0 ? (
                <p className="muted">Add members to the roster first.</p>
              ) : (
                <DistributeForm rounds={rounds} members={activeMembers} progress={progress} />
              )}
            </section>
            <section className="panel">
              <h2>Grader averages</h2>
              <p className="muted panel-sub">
                How each reviewer scores compared with the club. For reference only; no scores are adjusted.
              </p>
              {graderTables.length === 0 ? (
                <p className="muted">No scores entered yet.</p>
              ) : (
                graderTables.map((t) => (
                  <div key={t.round.id} className="grader-block">
                    <h3>
                      {t.round.name} <span className="muted">club average {t.clubAvg.toFixed(2)}</span>
                    </h3>
                    <GraderChart rows={t.rows} clubAvg={t.clubAvg} />
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th scope="col">Reviewer</th>
                            <th scope="col" className="num">Average</th>
                            <th scope="col" className="num">vs. club</th>
                            <th scope="col" className="num">Applicants with scores</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.rows.map((r) => (
                            <tr key={r.id}>
                              <td>{r.name}</td>
                              <td className="num">{r.avg.toFixed(2)}</td>
                              <td className={`num ${r.diff > 0.25 ? 'diff-up' : r.diff < -0.25 ? 'diff-down' : 'muted'}`}>
                                {r.diff >= 0 ? '+' : ''}
                                {r.diff.toFixed(2)}
                              </td>
                              <td className="num">{r.applicants}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </section>

            <section className="panel">
              <h2>Conflicts of interest</h2>
              <p className="muted panel-sub">
                Members who flagged a conflict are removed as that applicant&apos;s reviewer and sit out their vote.
              </p>
              {conflictRows.length === 0 ? (
                <p className="muted">No conflicts flagged.</p>
              ) : (
                <ul className="roster">
                  {conflictRows.map((c) => {
                    const thin = c.reviewerCounts.filter((rc) => rc.n === 0);
                    return (
                      <li key={`${c.applicant_id}-${c.member_id}`} className="roster-row">
                        <span className="roster-name">
                          <a href={`/applicants/${c.applicant_id}`}>{c.applicants.full_name}</a>
                        </span>
                        <span className="roster-email">Flagged by {c.memberName}</span>
                        <span className={thin.length ? 'form-error' : 'muted'}>
                          {thin.length
                            ? `No reviewer left in ${thin.map((t) => t.round).join(', ')}; reassign reviewers`
                            : c.reviewerCounts.map((rc) => `${rc.n} reviewer${rc.n === 1 ? '' : 's'} in ${rc.round}`).join(', ')}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <section className="panel">
            <h2>No active cycle</h2>
            <p className="muted">Create a recruitment cycle to assign reviewers.</p>
          </section>
        )}

        {cycle && (
          <section className="panel">
            <h2>Events</h2>
            <p className="muted panel-sub">
              Upload sign-in sheets (CSV or Excel) from info sessions and case workshops. Applicants are matched by email, then by
              exact name, and get a badge everyone can see. Attendee emails stay admin-only. Re-uploading replaces the list, and
              you can check people off by hand on their profile.
            </p>
            <EventsPanel events={eventRows} applicantCount={applicantTotal} />
          </section>
        )}

        {cycle && (
          <section className="panel export-panel">
            <div>
              <h2>Export results</h2>
              <p className="muted panel-sub">
                Everything from {cycle.name} in one Excel file: a summary, an &quot;Advancing&quot; list of who moves on from the most
                recent cutoff (with contact info, for sending invites), every score, note, vote, vouch, and conflict, and
                applicants&apos; answers. The red tabs (Advancing, Private) contain contact info, so delete them before sharing the
                file outside the exec board. Download one after each deliberation as a backup.
              </p>
            </div>
            <a href="/admin/export" className="btn btn-primary" download>Download results (.xlsx)</a>
          </section>
        )}

        <section className="panel">
          <h2>Roster</h2>
          <p className="muted panel-sub">
            Only people on this list can sign in. Admins see live scores, contact details, and extenuating circumstances.
          </p>
          <RosterForm />
          <ul className="roster">
            {activeMembers.map((m) => (
              <li key={m.id} className="roster-row">
                <span className="roster-name">
                  {m.full_name || <span className="muted">No name</span>}
                  {m.role === 'admin' && <span className="badge">Admin</span>}

                </span>
                <span className="roster-email">{m.email}</span>
                {m.id !== member.id && (
                  <span className="roster-actions">

                    <MemberButton id={m.id} action={m.role === 'admin' ? 'make_member' : 'make_admin'}>
                      {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                    </MemberButton>
                    <MemberButton id={m.id} action="remove">Remove</MemberButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {removedMembers.length > 0 && (
            <details className="removed">
              <summary>{removedMembers.length} removed</summary>
              <ul className="roster">
                {removedMembers.map((m) => (
                  <li key={m.id} className="roster-row">
                    <span className="roster-name">{m.full_name || m.email}</span>
                    <span className="roster-email">{m.email}</span>
                    <span className="roster-actions">
                      <MemberButton id={m.id} action="restore">Restore</MemberButton>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </main>
    </>
  );
}

function PhaseButton({ id, to, primary, disabled, confirm, children }) {
  return (
    <form action={setRoundPhase}>
      <input type="hidden" name="roundId" value={id} />
      <input type="hidden" name="phase" value={to} />
      {confirm ? (
        <ConfirmButton className={`btn ${primary ? 'btn-primary' : 'btn-quiet'}`} message={confirm} disabled={disabled}>
          {children}
        </ConfirmButton>
      ) : (
        <button className={`btn ${primary ? 'btn-primary' : 'btn-quiet'}`} disabled={disabled}>{children}</button>
      )}
    </form>
  );
}

function MemberButton({ id, action, children }) {
  return (
    <form action={updateMember}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button className="link-btn">{children}</button>
    </form>
  );
}
