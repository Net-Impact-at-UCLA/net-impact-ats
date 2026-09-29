-- =========================================================
-- Update 008: deliberation votes run 0 to 5 (half stars), matching criteria.
-- Run once in Supabase > SQL Editor. Existing votes are kept.
-- =========================================================
alter table public.votes drop constraint votes_stars_check;
alter table public.votes add constraint votes_stars_check
  check (stars between 0 and 5 and stars * 2 = trunc(stars * 2));

-- Members can withdraw their own vote (e.g. un-recuse) while voting is open.
create policy "withdraw own vote" on public.votes
  for delete to authenticated
  using (member_id = public.current_member_id() and public.round_phase_of(round_id) = 'voting');
