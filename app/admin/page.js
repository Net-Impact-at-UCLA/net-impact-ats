import { redirect } from 'next/navigation';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import RosterForm from '@/components/admin/RosterForm';
import DistributeForm from '@/components/admin/DistributeForm';
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
    .select('id, email, full_name, role, is_active')
    .order('full_name', { nullsFirst: false });
  const activeMembers = (allMembers || []).filter((m) => m.is_active);
  const removedMembers = (allMembers || []).filter((m) => !m.is_active);

  let rounds = [];
  let progress = {};
  if (cycle) {
    const { data: roundRows } = await supabase
      .from('rounds')
      .select('id, name, phase, sort_order')
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
      ? await supabase.from('scores').select('criterion_id, applicant_id, member_id').in('criterion_id', criteriaIds)
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

    rounds = (roundRows || []).map((r) => ({
      ...r,
      activeCount: (ra || []).filter((x) => x.round_id === r.id && x.applicants?.status === 'active').length,
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
                    <span className="round-name">{r.name}</span>
                    <span className={`phase phase-${r.phase}`}>{PHASE_LABEL[r.phase]}</span>
                    <span className="round-meta">
                      {r.activeCount} active
                      {r.assignedCount > 0 && `, ${r.doneCount} of ${r.assignedCount} reviews done`}
                    </span>
                    {(r.phase === 'setup' || r.phase === 'scoring') && (
                      <form action={setRoundPhase}>
                        <input type="hidden" name="roundId" value={r.id} />
                        <input type="hidden" name="phase" value={r.phase === 'setup' ? 'scoring' : 'setup'} />
                        <button className={`btn ${r.phase === 'setup' ? 'btn-primary' : 'btn-quiet'}`} disabled={r.phase === 'setup' && r.assignedCount === 0}>
                          {r.phase === 'setup' ? 'Open scoring' : 'Pause scoring'}
                        </button>
                      </form>
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
          </>
        ) : (
          <section className="panel">
            <h2>No active cycle</h2>
            <p className="muted">Create a recruitment cycle to assign reviewers.</p>
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

function MemberButton({ id, action, children }) {
  return (
    <form action={updateMember}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <button className="link-btn">{children}</button>
    </form>
  );
}
