-- =========================================================
-- Update 016: push an individual applicant to the next round after results
-- are released (and undo it while they're untouched in the next round).
-- Run once in Supabase > SQL Editor.
-- =========================================================
create or replace function public.push_after_release(p_round uuid, p_applicant uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds%rowtype;
  v_next  public.rounds%rowtype;
  v_ra    public.round_applicants%rowtype;
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  select * into v_round from rounds where id = p_round;
  if v_round.phase <> 'released' then raise exception 'Results for this round are not released'; end if;
  select * into v_ra from round_applicants where round_id = p_round and applicant_id = p_applicant;
  if v_ra.applicant_id is null then raise exception 'Applicant is not in this round'; end if;

  select * into v_next from rounds
  where cycle_id = v_round.cycle_id and sort_order > v_round.sort_order
  order by sort_order limit 1;

  if p_on then
    if v_ra.advanced then raise exception 'Already advanced'; end if;
    update round_applicants set advanced = true, advance_override = true
    where round_id = p_round and applicant_id = p_applicant;
    if v_next.id is not null then
      insert into round_applicants (round_id, applicant_id) values (v_next.id, p_applicant) on conflict do nothing;
      update applicants set status = 'active' where id = p_applicant;
    else
      update applicants set status = 'accepted' where id = p_applicant;
    end if;
  else
    if not (v_ra.advanced and v_ra.advance_override) then
      raise exception 'Only applicants pushed through after results can be undone here';
    end if;
    if v_next.id is not null then
      if exists (select 1 from assignments where round_id = v_next.id and applicant_id = p_applicant)
         or exists (select 1 from scores s join criteria c on c.id = s.criterion_id where c.round_id = v_next.id and s.applicant_id = p_applicant)
         or exists (select 1 from notes where round_id = v_next.id and applicant_id = p_applicant)
         or exists (select 1 from votes where round_id = v_next.id and applicant_id = p_applicant)
         or exists (select 1 from round_applicants where round_id = v_next.id and applicant_id = p_applicant and advanced is not null) then
        raise exception 'They already have activity in %, so this can no longer be undone', v_next.name;
      end if;
      delete from round_applicants where round_id = v_next.id and applicant_id = p_applicant;
    end if;
    update round_applicants set advanced = false, advance_override = false
    where round_id = p_round and applicant_id = p_applicant;
    update applicants set status = 'rejected' where id = p_applicant;
  end if;
end $$;
revoke execute on function public.push_after_release(uuid, uuid, boolean) from public, anon;
grant  execute on function public.push_after_release(uuid, uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
