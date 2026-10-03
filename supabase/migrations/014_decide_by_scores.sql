-- =========================================================
-- Update 014: rounds can be decided by REVIEW SCORES (cut line on each
-- applicant's average review score, no voting step) or by DELIBERATION
-- VOTES. The Application round switches to review scores.
-- Admins can push anyone through a review-score round.
-- Run once in Supabase > SQL Editor.
-- =========================================================

alter table public.rounds add column if not exists decide_by text not null default 'votes';
alter table public.rounds drop constraint if exists rounds_decide_by_check;
alter table public.rounds add constraint rounds_decide_by_check check (decide_by in ('votes', 'scores'));
update public.rounds set decide_by = 'scores' where stage = 'application';

-- The number a round is decided on, per applicant:
-- review-score rounds: average of every criterion score from every reviewer
-- vote rounds: average deliberation vote (recusals excluded)
create or replace function public.round_avg(p_round uuid, p_applicant uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select case (select decide_by from rounds where id = p_round)
    when 'scores' then (
      select round(avg(s.score), 2) from scores s join criteria c on c.id = s.criterion_id
      where c.round_id = p_round and s.applicant_id = p_applicant)
    else (
      select round(avg(v.stars), 2) from votes v
      where v.round_id = p_round and v.applicant_id = p_applicant and not v.recused)
  end
$$;

-- How many people that number is based on (reviewers or voters)
create or replace function public.round_count(p_round uuid, p_applicant uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select case (select decide_by from rounds where id = p_round)
    when 'scores' then (
      select count(distinct s.member_id) from scores s join criteria c on c.id = s.criterion_id
      where c.round_id = p_round and s.applicant_id = p_applicant)
    else (
      select count(*) from votes v
      where v.round_id = p_round and v.applicant_id = p_applicant and not v.recused)
  end
$$;

create or replace function public.vote_distribution(p_round uuid)
returns table (avg_stars numeric, vote_count bigint, by_vouch boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (is_admin() or (is_member() and round_phase_of(p_round) in ('closed','released'))) then
    raise exception 'Not allowed to view this distribution yet';
  end if;
  return query
    select round_avg(p_round, ra.applicant_id), round_count(p_round, ra.applicant_id), ra.advance_override
    from round_applicants ra
    where ra.round_id = p_round
    order by 1 desc nulls last;
end $$;

create or replace function public.round_results(p_round uuid)
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
      round_avg(p_round, a.id),
      round_count(p_round, a.id),
      (select count(*) from votes v where v.round_id = p_round and v.applicant_id = a.id and v.recused),
      (select round(avg(s.score), 2) from scores s join criteria c on c.id = s.criterion_id
         where c.round_id = p_round and s.applicant_id = a.id),
      ra.advanced,
      ra.advance_override
    from round_applicants ra
    join applicants a on a.id = ra.applicant_id
    where ra.round_id = p_round
    order by 3 desc nulls last;
end $$;

-- Push through: on vote rounds it still requires a hard vouch; on review-score rounds any applicant.
create or replace function public.set_advance_override(p_round uuid, p_applicant uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_mode text;
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  select decide_by into v_mode from rounds where id = p_round;
  if v_mode = 'scores' then
    if not exists (select 1 from rounds where id = p_round and phase = 'closed') then
      raise exception 'Close scoring before pushing applicants through';
    end if;
  else
    if not exists (select 1 from rounds where id = p_round and phase in ('voting', 'closed')) then
      raise exception 'Only during voting or at the cutoff';
    end if;
    if p_on and not exists (select 1 from vouches where applicant_id = p_applicant) then
      raise exception 'This applicant has no hard vouch';
    end if;
  end if;
  update round_applicants set advance_override = p_on where round_id = p_round and applicant_id = p_applicant;
end $$;

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
    raise exception 'Close the round before applying a cutoff';
  end if;

  update round_applicants ra
  set advanced = ra.advance_override or coalesce(round_avg(p_round, ra.applicant_id) >= p_cutoff, false)
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

revoke execute on function public.round_avg(uuid, uuid)   from public, anon;
revoke execute on function public.round_count(uuid, uuid) from public, anon;
grant  execute on function public.round_avg(uuid, uuid)   to authenticated;
grant  execute on function public.round_count(uuid, uuid) to authenticated;
