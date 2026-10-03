-- =========================================================
-- Update 015: "Reopen cut line". Undo an applied cut line while the next
-- round hasn't started. Run once in Supabase > SQL Editor.
-- =========================================================
create or replace function public.reopen_cutoff(p_round uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds%rowtype;
  v_next  public.rounds%rowtype;
begin
  if not is_admin() then raise exception 'Only admins can reopen a cut line'; end if;
  select * into v_round from rounds where id = p_round;
  if v_round.phase <> 'released' then raise exception 'This round has not been released'; end if;

  select * into v_next from rounds
  where cycle_id = v_round.cycle_id and sort_order > v_round.sort_order
  order by sort_order limit 1;

  if v_next.id is not null then
    if v_next.phase <> 'setup' then
      raise exception '% has already started, so this cut line can no longer be reopened', v_next.name;
    end if;
    if exists (select 1 from assignments where round_id = v_next.id)
       or exists (select 1 from scores s join criteria c on c.id = s.criterion_id where c.round_id = v_next.id)
       or exists (select 1 from notes where round_id = v_next.id)
       or exists (select 1 from votes where round_id = v_next.id) then
      raise exception '% already has assignments or scores, so this cut line can no longer be reopened', v_next.name;
    end if;
    delete from round_applicants
    where round_id = v_next.id
      and applicant_id in (select applicant_id from round_applicants where round_id = p_round and advanced);
  end if;

  update applicants set status = 'active'
  where status in ('rejected', 'accepted')
    and id in (select applicant_id from round_applicants where round_id = p_round);

  update round_applicants set advanced = null where round_id = p_round;
  update rounds set phase = 'closed', cutoff = null where id = p_round;
end $$;
revoke execute on function public.reopen_cutoff(uuid) from public, anon;
grant  execute on function public.reopen_cutoff(uuid) to authenticated;
