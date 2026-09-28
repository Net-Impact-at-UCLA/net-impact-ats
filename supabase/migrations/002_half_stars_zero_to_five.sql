-- =========================================================
-- Update 002: half-star scores (0.5 steps), and every criterion scored 0 to 5
-- Run once in Supabase > SQL Editor. Existing scores are kept.
-- =========================================================

-- Security rules reference the score column: drop, change, restore.
drop policy "write own scores" on public.scores;
drop policy "edit own scores"  on public.scores;
drop function public.can_score(uuid, uuid, uuid, int);

alter table public.scores drop constraint scores_score_check;
alter table public.scores alter column score type numeric(2,1);
alter table public.scores add constraint scores_score_check
  check (score between 0 and 5 and score * 2 = trunc(score * 2));

alter table public.votes drop constraint votes_stars_check;
alter table public.votes alter column stars type numeric(2,1);
alter table public.votes add constraint votes_stars_check
  check (stars between 1 and 5 and stars * 2 = trunc(stars * 2));

create function public.can_score(p_criterion uuid, p_applicant uuid, p_member uuid, p_score numeric)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id() and exists (
    select 1
    from criteria c
    join rounds r      on r.id = c.round_id
    join assignments a on a.round_id = r.id
                      and a.applicant_id = p_applicant
                      and a.member_id = p_member
    where c.id = p_criterion
      and r.phase = 'scoring'
      and p_score between c.min_score and c.max_score
  )
$$;

create policy "write own scores" on public.scores
  for insert to authenticated
  with check (public.can_score(criterion_id, applicant_id, member_id, score));
create policy "edit own scores" on public.scores
  for update to authenticated
  using (member_id = public.current_member_id() and public.criterion_phase_of(criterion_id) = 'scoring')
  with check (public.can_score(criterion_id, applicant_id, member_id, score));

-- Every criterion now starts at 0, including in future cycles.
alter table public.criteria alter column min_score set default 0;
update public.criteria set min_score = 0;

create or replace function public.create_cycle(p_name text, p_copy_from uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cycle uuid;
  v_round uuid;
  r       record;
begin
  if not is_admin() then
    raise exception 'Only admins can create cycles';
  end if;

  insert into cycles (name) values (p_name) returning id into v_cycle;

  if p_copy_from is not null then
    for r in select * from rounds where cycle_id = p_copy_from order by sort_order loop
      insert into rounds (cycle_id, stage, sort_order, name)
      values (v_cycle, r.stage, r.sort_order, r.name)
      returning id into v_round;

      insert into criteria (round_id, name, sort_order, min_score, max_score, context_field)
      select v_round, c.name, c.sort_order, c.min_score, c.max_score, c.context_field
      from criteria c where c.round_id = r.id;
    end loop;
    return v_cycle;
  end if;

  insert into rounds (cycle_id, stage, sort_order, name)
  values (v_cycle, 'application', 1, 'Application') returning id into v_round;
  insert into criteria (round_id, name, sort_order, min_score, context_field) values
    (v_round, 'Resume Content',  1, 0, 'resume'),
    (v_round, 'Resume Format',   2, 0, 'resume'),
    (v_round, 'Why Net Impact?', 3, 0, 'why_net_impact'),
    (v_round, 'Social Impact',   4, 0, 'social_issue');

  insert into rounds (cycle_id, stage, sort_order, name)
  values (v_cycle, 'coffee_chat', 2, 'Coffee Chats') returning id into v_round;
  insert into criteria (round_id, name, sort_order, min_score) values
    (v_round, 'Overall', 1, 0);

  insert into rounds (cycle_id, stage, sort_order, name)
  values (v_cycle, 'r1', 3, 'R1: Group Case') returning id into v_round;
  insert into criteria (round_id, name, sort_order, min_score) values
    (v_round, 'Collaboration',     1, 0),
    (v_round, 'Intro / Framework', 2, 0),
    (v_round, 'Section 1',         3, 0),
    (v_round, 'Section 2 (Math)',  4, 0),
    (v_round, 'Recommendation',    5, 0);

  insert into rounds (cycle_id, stage, sort_order, name)
  values (v_cycle, 'r2', 4, 'R2: Final Interview') returning id into v_round;
  insert into criteria (round_id, name, sort_order, min_score) values
    (v_round, 'Behaviorals',       1, 0),
    (v_round, 'Intro / Framework', 2, 0),
    (v_round, 'Section 1',         3, 0),
    (v_round, 'Section 2',         4, 0),
    (v_round, 'Recommendation',    5, 0);

  return v_cycle;
end $$;
