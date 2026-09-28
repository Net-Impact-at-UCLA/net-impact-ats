-- =========================================================
-- Update 005: the cutoff compares averages rounded to 2 decimals,
-- exactly as they're shown on the blind cutoff chart.
-- Run once in Supabase > SQL Editor.
-- =========================================================
create or replace function public.apply_cutoff(p_round uuid, p_cutoff numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds%rowtype;
  v_next  uuid;
begin
  if not is_admin() then
    raise exception 'Only admins can apply a cutoff';
  end if;

  select * into v_round from rounds where id = p_round;
  if v_round.phase <> 'closed' then
    raise exception 'Close voting before applying a cutoff';
  end if;

  update round_applicants ra
  set advanced = coalesce((
    select round(avg(v.stars), 2) from votes v
    where v.round_id = ra.round_id and v.applicant_id = ra.applicant_id and not v.recused
  ) >= p_cutoff, false)
  where ra.round_id = p_round;

  select id into v_next from rounds
  where cycle_id = v_round.cycle_id and sort_order > v_round.sort_order
  order by sort_order limit 1;

  if v_next is not null then
    insert into round_applicants (round_id, applicant_id)
    select v_next, applicant_id from round_applicants
    where round_id = p_round and advanced
    on conflict do nothing;
  else
    update applicants set status = 'accepted'
    where id in (select applicant_id from round_applicants where round_id = p_round and advanced);
  end if;

  update applicants set status = 'rejected'
  where status = 'active'
    and id in (select applicant_id from round_applicants where round_id = p_round and not advanced);

  update rounds set cutoff = p_cutoff, phase = 'released' where id = p_round;
end $$;
