-- =========================================================
-- Update 012: "Advance by hard vouch". Admins can mark a hard-vouched
-- applicant to advance regardless of the cutoff, during voting or at the
-- cutoff. Run once in Supabase > SQL Editor.
-- =========================================================

alter table public.round_applicants add column if not exists advance_override boolean not null default false;

-- Admin-only toggle. Turning it on requires at least one hard vouch.
create or replace function public.set_advance_override(p_round uuid, p_applicant uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  if not exists (select 1 from rounds where id = p_round and phase in ('voting', 'closed')) then
    raise exception 'Only during voting or at the cutoff';
  end if;
  if p_on and not exists (select 1 from vouches where applicant_id = p_applicant) then
    raise exception 'This applicant has no hard vouch';
  end if;
  update round_applicants set advance_override = p_on where round_id = p_round and applicant_id = p_applicant;
end $$;
revoke execute on function public.set_advance_override(uuid, uuid, boolean) from public, anon;
grant  execute on function public.set_advance_override(uuid, uuid, boolean) to authenticated;

-- The anonymous distribution now also says which bars advance by vouch (still no names).
drop function if exists public.vote_distribution(uuid);
create function public.vote_distribution(p_round uuid)
returns table (avg_stars numeric, vote_count bigint, by_vouch boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (is_admin() or (is_member() and round_phase_of(p_round) in ('closed','released'))) then
    raise exception 'Not allowed to view this distribution yet';
  end if;
  return query
    select round(avg(v.stars), 2), count(v.stars), bool_or(ra.advance_override)
    from round_applicants ra
    left join votes v on v.round_id = ra.round_id
                     and v.applicant_id = ra.applicant_id
                     and not v.recused
    where ra.round_id = p_round
    group by ra.applicant_id
    order by 1 desc nulls last;
end $$;
revoke execute on function public.vote_distribution(uuid) from public, anon;
grant  execute on function public.vote_distribution(uuid) to authenticated;

-- Named results include the flag.
drop function if exists public.round_results(uuid);
create function public.round_results(p_round uuid)
returns table (
  applicant_id uuid, full_name text, avg_stars numeric, vote_count bigint,
  recusals bigint, avg_interview_score numeric, advanced boolean, by_vouch boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (is_admin() or (is_member() and round_phase_of(p_round) = 'released')) then
    raise exception 'Results are hidden until the round is released';
  end if;
  return query
    select
      a.id, a.full_name,
      round(avg(v.stars), 2),
      count(v.stars),
      count(*) filter (where v.recused),
      (select round(avg(s.score), 2)
         from scores s join criteria c on c.id = s.criterion_id
         where c.round_id = p_round and s.applicant_id = a.id),
      ra.advanced,
      ra.advance_override
    from round_applicants ra
    join applicants a on a.id = ra.applicant_id
    left join votes v on v.round_id = ra.round_id and v.applicant_id = ra.applicant_id
    where ra.round_id = p_round
    group by a.id, a.full_name, ra.advanced, ra.advance_override
    order by 3 desc nulls last;
end $$;
revoke execute on function public.round_results(uuid) from public, anon;
grant  execute on function public.round_results(uuid) to authenticated;

-- The cutoff advances anyone at/above the line OR marked to advance by vouch.
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
  set advanced = ra.advance_override or coalesce((
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
