-- =========================================================
-- Update 019: move an applicant from released Coffee Chats results into the
-- makeup pile, and return them. Run once in Supabase > SQL Editor.
-- =========================================================
create or replace function public.move_to_makeup(p_round uuid, p_applicant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds%rowtype;
  v_next  public.rounds%rowtype;
  v_ra    public.round_applicants%rowtype;
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  select * into v_round from rounds where id = p_round;
  if v_round.stage <> 'coffee_chat' then raise exception 'Makeups are only for coffee chats'; end if;
  if v_round.phase <> 'released' then raise exception 'Use Mark as makeup on the profile until results are released'; end if;
  select * into v_ra from round_applicants where round_id = p_round and applicant_id = p_applicant;
  if v_ra.applicant_id is null then raise exception 'Applicant is not in this round'; end if;
  if v_ra.makeup then raise exception 'Already a makeup'; end if;

  select * into v_next from rounds where cycle_id = v_round.cycle_id and sort_order > v_round.sort_order order by sort_order limit 1;
  if v_ra.advanced and v_next.id is not null then
    if exists (select 1 from assignments where round_id = v_next.id and applicant_id = p_applicant)
       or exists (select 1 from scores s join criteria c on c.id = s.criterion_id where c.round_id = v_next.id and s.applicant_id = p_applicant)
       or exists (select 1 from notes where round_id = v_next.id and applicant_id = p_applicant)
       or exists (select 1 from votes where round_id = v_next.id and applicant_id = p_applicant) then
      raise exception 'They already have activity in %, so they can no longer be moved', v_next.name;
    end if;
    delete from round_applicants where round_id = v_next.id and applicant_id = p_applicant;
  end if;

  update round_applicants
  set makeup = true, advanced = null, advance_override = false, cut_override = false
  where round_id = p_round and applicant_id = p_applicant;
  update applicants set status = 'active' where id = p_applicant;
end $$;

-- Put a pending makeup back into the main results, decided by the applied cutoff
create or replace function public.return_from_makeup(p_round uuid, p_applicant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds%rowtype;
  v_next  public.rounds%rowtype;
  v_ra    public.round_applicants%rowtype;
  v_adv   boolean;
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  select * into v_round from rounds where id = p_round;
  if v_round.phase <> 'released' then raise exception 'Results are not released'; end if;
  select * into v_ra from round_applicants where round_id = p_round and applicant_id = p_applicant;
  if not coalesce(v_ra.makeup, false) or v_ra.advanced is not null then
    raise exception 'Only undecided makeups can be returned to the results';
  end if;

  v_adv := coalesce(round_avg(p_round, p_applicant) >= v_round.cutoff, false);
  update round_applicants set makeup = false, advanced = v_adv where round_id = p_round and applicant_id = p_applicant;

  select * into v_next from rounds where cycle_id = v_round.cycle_id and sort_order > v_round.sort_order order by sort_order limit 1;
  if v_adv then
    if v_next.id is not null then
      insert into round_applicants (round_id, applicant_id) values (v_next.id, p_applicant) on conflict do nothing;
      update applicants set status = 'active' where id = p_applicant;
    else
      update applicants set status = 'accepted' where id = p_applicant;
    end if;
  else
    update applicants set status = 'rejected' where id = p_applicant;
  end if;
end $$;

revoke execute on function public.move_to_makeup(uuid, uuid) from public, anon;
grant  execute on function public.move_to_makeup(uuid, uuid) to authenticated;
revoke execute on function public.return_from_makeup(uuid, uuid) from public, anon;
grant  execute on function public.return_from_makeup(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
