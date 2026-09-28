import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import Avatar from '@/components/Avatar';
import StageTrack from '@/components/StageTrack';
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
    supabase.from('rounds').select('id, name, sort_order').eq('cycle_id', applicant.cycle_id).order('sort_order'),
    supabase.from('round_applicants').select('round_id, applicant_id').eq('applicant_id', id),
    isAdmin
      ? supabase.from('applicant_private').select('*').eq('applicant_id', id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const priv = privateRes.data;

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

        <div className="profile-grid">
          <aside className="profile-side">
            <div className="profile-id">
              <Avatar name={applicant.full_name} src={headshot} size={120} />
              <h1>{applicant.full_name}</h1>
              {applicant.pronouns && <p className="profile-pronouns">{applicant.pronouns}</p>}
            </div>

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
                <h3>Extenuating circumstances</h3>
                <p className="prose">{priv?.extenuating_circumstances || 'None shared.'}</p>
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
