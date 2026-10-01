import Link from 'next/link';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import DeliberationList from '@/components/DeliberationList';
import AutoRefresh from '@/components/AutoRefresh';
import { getSession } from '@/lib/session';
import { loadDeliberation } from '@/lib/deliberation';

export const metadata = { title: 'Deliberations · Net Impact ATS' };

export default async function DeliberatePage() {
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;
  const { cycle, round, applicants } = await loadDeliberation(supabase);

  if (!round) {
    return (
      <>
        <Header member={member} cycleName={cycle?.name} />
        <main className="page">
          <AutoRefresh label={false} />
          <div className="empty">
            <h1>Deliberations</h1>
            <p>Voting isn&apos;t open right now. This page fills in when an admin opens deliberation voting for a round.</p>
          </div>
        </main>
      </>
    );
  }

  const [{ data: myVotes }, { data: myConflicts }] = await Promise.all([
    supabase.from('votes').select('applicant_id, stars, recused').eq('round_id', round.id).eq('member_id', member.id),
    supabase.from('conflicts').select('applicant_id').eq('member_id', member.id),
  ]);

  return (
    <>
      <Header member={member} cycleName={cycle.name} />
      <main className="page delib-page">
        <div className="live-bar"><AutoRefresh /></div>
        <DeliberationList
          round={round}
          applicants={applicants}
          memberId={member.id}
          initialVotes={Object.fromEntries((myVotes || []).map((v) => [v.applicant_id, { stars: v.stars == null ? null : Number(v.stars), recused: v.recused }]))}
          conflictIds={(myConflicts || []).map((c) => c.applicant_id)}
          isAdmin={member.role === 'admin'}
        />
      </main>
    </>
  );
}
