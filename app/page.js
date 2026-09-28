import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import ApplicantList from '@/components/ApplicantList';
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
