-- =========================================================
-- Update 022: makeups for any round after Application (Coffee Chats, R1, R2).
-- Run once in Supabase > SQL Editor.
-- =========================================================
create or replace function public.grading_open(p_round uuid, p_applicant uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds r
    left join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
    where r.id = p_round
      and (r.phase = 'scoring'
           or (r.stage <> 'application' and r.phase in ('voting', 'closed', 'released')
               and ra.makeup and ra.advanced is null))
  )
$$;

create or replace function public.set_makeup(p_round uuid, p_applicant uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  if not exists (select 1 from rounds where id = p_round and stage <> 'application') then
    raise exception 'Makeups are for rounds after the application';
  end if;
  if not exists (select 1 from round_applicants where round_id = p_round and applicant_id = p_applicant and advanced is null) then
    raise exception 'This applicant has already been decided for this round';
  end if;
  if not p_on and exists (select 1 from rounds where id = p_round and phase = 'released') then
    raise exception 'Results are already released; decide this makeup with the buttons on the round page instead';
  end if;
  update round_applicants set makeup = p_on where round_id = p_round and applicant_id = p_applicant;
  if p_on then
    delete from votes where round_id = p_round and applicant_id = p_applicant;
  end if;
end $$;

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
  if v_round.stage = 'application' then raise exception 'Makeups are for rounds after the application'; end if;
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

notify pgrst, 'reload schema';
