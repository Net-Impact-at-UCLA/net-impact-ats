import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function Header({ member, cycleName }) {
  // "My table" while coffee chat scoring is open; "Deliberations" while any round is voting
  let tableOpen = false;
  let votingOpen = false;
  if (member) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('rounds')
      .select('stage, phase, cycles!inner(is_active)')
      .eq('cycles.is_active', true)
      .in('phase', ['scoring', 'voting']);
    tableOpen = (data || []).some((r) => r.stage === 'coffee_chat' && r.phase === 'scoring');
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
          <Link href="/">Applicants</Link>
          {tableOpen && <Link href="/table" className="topnav-table">My table</Link>}
          {votingOpen && <Link href="/deliberate" className="topnav-table">Deliberations</Link>}
          <Link href="/rounds">Rounds</Link>
          {member?.role === 'admin' && <Link href="/admin">Admin</Link>}
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
