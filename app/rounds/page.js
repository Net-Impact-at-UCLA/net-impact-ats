import Link from 'next/link';
import Header from '@/components/Header';
import NotOnRoster from '@/components/NotOnRoster';
import { getSession, getActiveCycle } from '@/lib/session';

const PHASE_LABEL = {
  setup: 'Not started',
  scoring: 'Scoring open',
  voting: 'Deliberation voting',
  closed: 'Voting closed: blind cutoff',
  released: 'Results released',
};

export default async function RoundsPage() {
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;
  const cycle = await getActiveCycle(supabase);
  const { data: rounds } = cycle
    ? await supabase.from('rounds').select('id, name, phase').eq('cycle_id', cycle.id).order('sort_order')
    : { data: [] };

  return (
    <>
      <Header member={member} cycleName={cycle?.name} />
      <main className="page">
        <div className="page-head"><h1>Rounds</h1></div>
        <ul className="rows">
          {(rounds || []).map((r) => (
            <li key={r.id}>
              <Link href={`/rounds/${r.id}`} className="row row-round">
                <span className="row-name">{r.name}</span>
                <span className={`phase phase-${r.phase}`}>{PHASE_LABEL[r.phase]}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
