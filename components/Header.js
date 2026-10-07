import Link from 'next/link';
import NavLink from './NavLink';
import { createClient } from '@/lib/supabase/server';

export default async function Header({ member, cycleName }) {
  // "My table" while coffee chat scoring is open; "Deliberations" while any round is voting
  let tableOpen = false;
  let votingOpen = false;
  if (member) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('rounds')
      .select('*, cycles!inner(is_active)')
      .eq('cycles.is_active', true)
      .in('phase', ['scoring', 'voting']);
    tableOpen = (data || []).some((r) => (r.self_select ?? r.stage === 'coffee_chat') && r.phase === 'scoring');
    if (!tableOpen) {
      const { data: mk } = await supabase
        .from('round_applicants')
        .select('applicant_id, rounds!inner(stage, phase, cycles!inner(is_active))')
        .eq('makeup', true)
        .is('advanced', null)
        .neq('rounds.stage', 'application')
        .eq('rounds.cycles.is_active', true)
        .in('rounds.phase', ['voting', 'closed', 'released'])
        .limit(1);
      tableOpen = (mk || []).length > 0;
    }
    votingOpen = (data || []).some((r) => r.phase === 'voting');
  }

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden="true" />
          Net Impact ATS
        </Link>
        {cycleName && <span className="cycle-name">{cycleName}</span>}
        <nav className="topnav">
          <NavLink href="/">Applicants</NavLink>
          {tableOpen && <NavLink href="/table" live>My table</NavLink>}
          {votingOpen && <NavLink href="/deliberate" live>Deliberations</NavLink>}
          <NavLink href="/rounds">Rounds</NavLink>
          {member?.role === 'admin' && <NavLink href="/admin">Admin</NavLink>}
        </nav>
        <div className="topbar-right">
          {member && (
            <span className="who">
              {member.full_name || member.email}
              {member.role === 'admin' && <span className="badge">Admin</span>}
            </span>
          )}
          <form action="/auth/signout" method="post">
            <button className="btn btn-quiet" type="submit">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
