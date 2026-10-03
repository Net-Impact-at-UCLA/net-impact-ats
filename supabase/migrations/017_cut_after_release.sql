-- =========================================================
-- Update 017: cut an individual advanced applicant after results are
-- released (and undo it). Run once in Supabase > SQL Editor.
-- =========================================================
alter table public.round_applicants add column if not exists cut_override boolean not null default false;

create or replace function public.cut_after_release(p_round uuid, p_applicant uuid, p_on boolean)
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
    if not v_ra.advanced then raise exception 'Not advanced, so there is nothing to cut'; end if;
    if v_next.id is not null then
      if exists (select 1 from assignments where round_id = v_next.id and applicant_id = p_applicant)
         or exists (select 1 from scores s join criteria c on c.id = s.criterion_id where c.round_id = v_next.id and s.applicant_id = p_applicant)
         or exists (select 1 from notes where round_id = v_next.id and applicant_id = p_applicant)
         or exists (select 1 from votes where round_id = v_next.id and applicant_id = p_applicant)
         or exists (select 1 from round_applicants where round_id = v_next.id and applicant_id = p_applicant and advanced is not null) then
        raise exception 'They already have activity in %, so they can no longer be cut here', v_next.name;
      end if;
      delete from round_applicants where round_id = v_next.id and applicant_id = p_applicant;
    end if;
    update round_applicants set advanced = false, advance_override = false, cut_override = true
    where round_id = p_round and applicant_id = p_applicant;
    update applicants set status = 'rejected' where id = p_applicant;
  else
    if not v_ra.cut_override then raise exception 'Only applicants cut after results can be restored here'; end if;
    update round_applicants set advanced = true, cut_override = false
    where round_id = p_round and applicant_id = p_applicant;
    if v_next.id is not null then
      insert into round_applicants (round_id, applicant_id) values (v_next.id, p_applicant) on conflict do nothing;
      update applicants set status = 'active' where id = p_applicant;
    else
      update applicants set status = 'accepted' where id = p_applicant;
    end if;
  end if;
end $$;
revoke execute on function public.cut_after_release(uuid, uuid, boolean) from public, anon;
grant  execute on function public.cut_after_release(uuid, uuid, boolean) to authenticated;

-- Reopening the cut line or pushing someone also clears a hand cut
create or replace function public.clear_cut_flags() returns trigger language plpgsql as $$
begin
  if new.advanced is null or (new.advanced and new.advance_override) then new.cut_override := false; end if;
  return new;
end $$;
drop trigger if exists round_applicants_clear_cut on public.round_applicants;
create trigger round_applicants_clear_cut before update on public.round_applicants
for each row execute function public.clear_cut_flags();

notify pgrst, 'reload schema';
