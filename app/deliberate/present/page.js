import { redirect } from 'next/navigation';
import NotOnRoster from '@/components/NotOnRoster';
import PresentView from '@/components/PresentView';
import { getSession } from '@/lib/session';
import { loadDeliberation, loadContext } from '@/lib/deliberation';

export const metadata = { title: 'Deliberations (TV) · Net Impact ATS' };

// Screen-share view for deliberations. Shows only what every member can see:
// no contact info, extenuating circumstances, or votes.
export default async function PresentPage() {
  const { supabase, user, member } = await getSession();
  if (!member) return <NotOnRoster email={user?.email} />;
  if (member.role !== 'admin') redirect('/deliberate');

  const { round, criteria, applicants, roster } = await loadDeliberation(supabase);
  if (!round) redirect('/deliberate');
  const context = await loadContext(supabase, round, criteria, roster);

  return <PresentView round={round} criteria={criteria} applicants={applicants} context={context} />;
}
