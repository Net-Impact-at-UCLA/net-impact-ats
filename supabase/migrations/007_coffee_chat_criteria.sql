-- =========================================================
-- Update 007: Coffee Chats are scored on Social Fit and Professionalism.
-- Only changes Coffee Chats rounds that haven't started (phase = setup),
-- so no existing scores are touched. Also updates the default for new cycles.
-- Run once in Supabase > SQL Editor.
-- =========================================================
delete from public.criteria c
using public.rounds r
where c.round_id = r.id and r.stage = 'coffee_chat' and r.phase = 'setup';

insert into public.criteria (round_id, name, sort_order, min_score)
select r.id, x.name, x.ord, 0
from public.rounds r, (values ('Social Fit', 1), ('Professionalism', 2)) as x(name, ord)
where r.stage = 'coffee_chat' and r.phase = 'setup';

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
    (v_round, 'Social Fit',      1, 0),
    (v_round, 'Professionalism', 2, 0);

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
