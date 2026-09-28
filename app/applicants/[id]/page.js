import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import Avatar from '@/components/Avatar';
import StageTrack from '@/components/StageTrack';
import ScorePanel from '@/components/ScorePanel';
import VouchBox from '@/components/VouchBox';
import ConflictButton from '@/components/ConflictButton';
import RemoveApplicantButton from '@/components/RemoveApplicantButton';
import { getSession, signedUrls } from '@/lib/session';
import { withProgress } from '@/lib/applicants';

export default async function ApplicantPage({ params }) {
  const { id } = await params;
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;

  const { data: applicant } = await supabase
    .from('applicants')
    .select('*, cycles(name)')
    .eq('id', id)
    .maybeSingle();
  if (!applicant) notFound();

  const isAdmin = member.role === 'admin';
  const [{ data: rounds }, { data: roundApplicants }, privateRes] = await Promise.all([
    supabase.from('rounds').select('id, name, phase, sort_order').eq('cycle_id', applicant.cycle_id).order('sort_order'),
    supabase.from('round_applicants').select('round_id, applicant_id').eq('applicant_id', id),
    isAdmin
      ? supabase.from('applicant_private').select('*').eq('applicant_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const priv = privateRes.data;

  // Rounds this member is assigned to review for this applicant
  const { data: myAssignments } = await supabase
    .from('assignments')
    .select('round_id')
    .eq('applicant_id', id)
    .eq('member_id', member.id);
  const myRoundIds = (myAssignments || []).map((a) => a.round_id);
  const myRounds = (rounds || []).filter((r) => myRoundIds.includes(r.id));
  const openRounds = myRounds.filter((r) => r.phase === 'scoring');

  let panels = [];
  if (openRounds.length) {
    const openIds = openRounds.map((r) => r.id);
    const { data: criteria } = await supabase
      .from('criteria')
      .select('id, round_id, name, min_score, max_score, sort_order')
      .in('round_id', openIds)
      .order('sort_order');
    const criteriaIds = (criteria || []).map((c) => c.id);
    const [{ data: myScores }, { data: myNotes }] = await Promise.all([
      criteriaIds.length
        ? supabase.from('scores').select('criterion_id, score').eq('applicant_id', id).eq('member_id', member.id).in('criterion_id', criteriaIds)
        : Promise.resolve({ data: [] }),
      supabase.from('notes').select('round_id, criterion_id, body').eq('applicant_id', id).eq('member_id', member.id).in('round_id', openIds),
    ]);
    panels = openRounds.map((r) => {
      const rc = (criteria || []).filter((c) => c.round_id === r.id);
      const scores = {};
      (myScores || []).forEach((s) => {
        if (rc.some((c) => c.id === s.criterion_id)) scores[s.criterion_id] = s.score;
      });
      const notes = {};
      (myNotes || [])
        .filter((n) => n.round_id === r.id)
        .forEach((n) => {
          notes[n.criterion_id || 'general'] = n.body;
        });
      return { round: r, criteria: rc, scores, notes };
    });
  }
  const waitingRounds = myRounds.filter((r) => r.phase === 'setup');

  // "Next in queue": the next applicant in each open round that this member hasn't finished scoring
  if (panels.length) {
    const openIds = panels.map((p) => p.round.id);
    const [{ data: queueRows }, { data: allCriteria }] = await Promise.all([
      supabase.from('assignments').select('round_id, applicant_id').eq('member_id', member.id).in('round_id', openIds),
      supabase.from('criteria').select('id, round_id').in('round_id', openIds),
    ]);
    const queueIds = [...new Set((queueRows || []).map((q) => q.applicant_id))];
    const { data: queueNames } = queueIds.length
      ? await supabase.from('applicants').select('id, full_name').in('id', queueIds)
      : { data: [] };
    const nameById = Object.fromEntries((queueNames || []).map((a) => [a.id, a.full_name]));
    const critIds = (allCriteria || []).map((c) => c.id);
    const { data: myAllScores } = critIds.length
      ? await supabase.from('scores').select('criterion_id, applicant_id').eq('member_id', member.id).in('criterion_id', critIds)
      : { data: [] };
    const roundOfCrit = Object.fromEntries((allCriteria || []).map((c) => [c.id, c.round_id]));
    const done = {};
    (myAllScores || []).forEach((sc) => {
      const k = `${roundOfCrit[sc.criterion_id]}|${sc.applicant_id}`;
      done[k] = (done[k] || 0) + 1;
    });
    const need = {};
    (allCriteria || []).forEach((c) => (need[c.round_id] = (need[c.round_id] || 0) + 1));
    panels = panels.map((p) => {
      const mine = (queueRows || [])
        .filter((q) => q.round_id === p.round.id)
        .map((q) => ({ id: q.applicant_id, name: nameById[q.applicant_id] || '' }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const unfinished = mine.filter((q) => q.id !== id && (done[`${p.round.id}|${q.id}`] || 0) < need[p.round.id]);
      const after = unfinished.find((q) => q.name.localeCompare(applicant.full_name) > 0) || unfinished[0];
      return { ...p, next: after ? { id: after.id, name: after.name, remaining: unfinished.length } : null };
    });
  }

  const [{ data: myVouch }, { data: counts }, { data: myConflict }, adminVouchRes] = await Promise.all([
    supabase.from('vouches').select('reason').eq('applicant_id', id).eq('member_id', member.id).maybeSingle(),
    supabase.rpc('vouch_counts', { p_cycle: applicant.cycle_id }),
    supabase.from('conflicts').select('applicant_id').eq('applicant_id', id).eq('member_id', member.id).maybeSingle(),
    isAdmin
      ? supabase.from('vouches').select('reason, members(full_name, email)').eq('applicant_id', id).order('created_at')
      : Promise.resolve({ data: null }),
  ]);
  const vouchCount = (counts || []).find((c) => c.applicant_id === id)?.vouch_count || 0;
  const adminVouches = (adminVouchRes.data || []).map((v) => ({ name: v.members?.full_name || v.members?.email, reason: v.reason }));
  const firstName = applicant.full_name.split(' ')[0];

  const [withStage] = withProgress([applicant], rounds || [], roundApplicants || []);
  const urls = await signedUrls(supabase, [applicant.headshot_path, applicant.resume_path]);
  const headshot = urls[applicant.headshot_path];
  const resume = urls[applicant.resume_path];

  const facts = [
    ['Major(s) and minor(s)', applicant.majors],
    ['GPA', applicant.gpa],
    ['Expected graduation', applicant.grad_year],
    ['Transfer student', applicant.is_transfer == null ? null : applicant.is_transfer ? 'Yes' : 'No'],
  ].filter(([, v]) => v);

  return (
    <>
      <Header member={member} cycleName={applicant.cycles?.name} />
      <main className="page profile">
        <Link href="/" className="back">Back to applicants</Link>

        <div className={`profile-grid ${panels.length || waitingRounds.length ? 'has-score' : ''}`}>
          <aside className="profile-side">
            <div className="profile-id">
              <Avatar name={applicant.full_name} src={headshot} size={120} />
              <h1>{applicant.full_name}</h1>
              {applicant.pronouns && <p className="profile-pronouns">{applicant.pronouns}</p>}
            </div>

            <VouchBox
              applicantId={id}
              memberId={member.id}
              firstName={firstName}
              myVouch={myVouch}
              count={Number(vouchCount)}
              adminVouches={isAdmin ? adminVouches : null}
            />

            <StageTrack rounds={rounds || []} reachedIndex={withStage.reachedIndex} status={applicant.status} showLabels />

            <dl className="facts">
              {facts.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
              {applicant.linkedin_url && (
                <div>
                  <dt>LinkedIn / website</dt>
                  <dd>
                    <a href={applicant.linkedin_url.startsWith('http') ? applicant.linkedin_url : `https://${applicant.linkedin_url}`} target="_blank" rel="noreferrer">
                      {applicant.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            <ConflictButton applicantId={id} firstName={firstName} hasConflict={!!myConflict} />

            {isAdmin && (
              <section className="private" aria-label="Admin-only details">
                <h2>Admin only</h2>
                <dl className="facts">
                  <div><dt>Email</dt><dd>{priv?.email || 'Not provided'}</dd></div>
                  <div><dt>Phone</dt><dd>{priv?.phone || 'Not provided'}</dd></div>
                  {priv?.submitted_at && (
                    <div><dt>Submitted</dt><dd>{new Date(priv.submitted_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
                  )}
                </dl>
                {priv?.import_issues && (
                  <div className="import-issue">
                    <h3>Import problem</h3>
                    <p className="prose">{priv.import_issues}</p>
                  </div>
                )}
                <h3>Extenuating circumstances</h3>
                <p className="prose">{priv?.extenuating_circumstances || 'None shared.'}</p>
                <RemoveApplicantButton id={id} name={applicant.full_name} />
              </section>
            )}
          </aside>

          <div className="profile-main">
            <section className="block">
              <div className="block-head">
                <h2>Resume</h2>
                {resume && <a href={resume} target="_blank" rel="noreferrer">Open in new tab</a>}
              </div>
              {resume ? (
                <iframe className="resume" src={resume} title={`${applicant.full_name} resume`} />
              ) : (
                <p className="muted">No resume on file.</p>
              )}
            </section>

            <Answer title="Why Net Impact?" body={applicant.why_net_impact} />
            <Answer title="A social or environmental issue that matters to them" body={applicant.social_issue} />
            <Answer title="Something not on their resume" body={applicant.fun_fact} />
          </div>

          {(panels.length > 0 || waitingRounds.length > 0) && (
            <aside className="profile-score">
              {panels.map((p) => (
                <ScorePanel
                  key={p.round.id}
                  round={p.round}
                  criteria={p.criteria}
                  initialScores={p.scores}
                  initialNotes={p.notes}
                  applicantId={id}
                  memberId={member.id}
                  next={p.next}
                />
              ))}
              {waitingRounds.map((r) => (
                <section key={r.id} className="score-panel score-waiting">
                  <h2>You&apos;re reviewing this applicant for {r.name}</h2>
                  <p className="muted">Scoring opens when an admin starts the round.</p>
                </section>
              ))}
            </aside>
          )}
        </div>
      </main>
    </>
  );
}

function Answer({ title, body }) {
  const words = body ? body.trim().split(/\s+/).length : 0;
  return (
    <section className="block">
      <div className="block-head">
        <h2>{title}</h2>
        {body && <span className="muted">{words} words</span>}
      </div>
      <p className="prose">{body || 'No answer.'}</p>
    </section>
  );
}
