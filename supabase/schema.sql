-- =========================================================
-- Net Impact UCLA ATS: database schema (v1)
-- How to run: Supabase dashboard > SQL Editor > New query,
-- paste this whole file, click Run. Run it once on a fresh project.
-- =========================================================


-- ---------------------------------------------------------
-- 1. TYPES
-- ---------------------------------------------------------
create type public.member_role      as enum ('member', 'admin');
create type public.round_stage      as enum ('application', 'coffee_chat', 'r1', 'r2');
-- setup -> scoring -> voting -> closed (blind cutoff) -> released
create type public.round_phase      as enum ('setup', 'scoring', 'voting', 'closed', 'released');
create type public.applicant_status as enum ('active', 'accepted', 'rejected', 'withdrawn');


-- ---------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------

-- Club roster. Only emails listed here can use the app.
-- role 'admin' = the 2-3 exec with live score access and controls.
create table public.members (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique check (email = lower(email)),
  full_name  text,
  role       public.member_role not null default 'member',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- A recruitment cycle, e.g. "Fall 2026".
create table public.cycles (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  is_active  boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index cycles_one_active on public.cycles (is_active) where is_active;

create table public.rounds (
  id         uuid primary key default gen_random_uuid(),
  cycle_id   uuid not null references public.cycles on delete cascade,
  stage      public.round_stage not null,
  sort_order int not null,
  name       text not null,
  phase      public.round_phase not null default 'setup',
  cutoff     numeric(3,2),
  created_at timestamptz not null default now(),
  unique (cycle_id, stage)
);

-- Scoring criteria per round (editable in the admin panel).
-- context_field tells the UI which application content to show
-- next to the criterion, e.g. 'resume' or 'why_net_impact'.
create table public.criteria (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  min_score     int not null default 0 check (min_score in (0, 1)),
  max_score     int not null default 5 check (max_score = 5),
  context_field text
);

-- Applicant info visible to ALL members.
create table public.applicants (
  id             uuid primary key default gen_random_uuid(),
  cycle_id       uuid not null references public.cycles on delete cascade,
  full_name      text not null,
  pronouns       text,
  majors         text,
  gpa            text,
  grad_year      text,
  is_transfer    boolean,
  linkedin_url   text,
  headshot_path  text,   -- path in the applicant-files storage bucket
  resume_path    text,
  why_net_impact text,
  social_issue   text,
  fun_fact       text,
  status         public.applicant_status not null default 'active',
  created_at     timestamptz not null default now()
);

-- Applicant info visible to ADMINS ONLY.
create table public.applicant_private (
  applicant_id              uuid primary key references public.applicants on delete cascade,
  email                     text,
  phone                     text,
  submitted_at              timestamptz,
  extenuating_circumstances text
);

-- Which applicants are in which round, and whether they advanced.
create table public.round_applicants (
  round_id     uuid not null references public.rounds on delete cascade,
  applicant_id uuid not null references public.applicants on delete cascade,
  advanced     boolean,
  primary key (round_id, applicant_id)
);

-- Who is allowed to score/take notes on an applicant in a round
-- (application reviewers, coffee chatters, interviewers in the room).
create table public.assignments (
  round_id     uuid not null,
  applicant_id uuid not null,
  member_id    uuid not null references public.members on delete cascade,
  primary key (round_id, applicant_id, member_id),
  foreign key (round_id, applicant_id)
    references public.round_applicants (round_id, applicant_id) on delete cascade
);

-- Scoring-phase star scores, one per criterion per evaluator.
create table public.scores (
  criterion_id uuid not null references public.criteria on delete cascade,
  applicant_id uuid not null references public.applicants on delete cascade,
  member_id    uuid not null references public.members on delete cascade,
  score        numeric(2,1) not null check (score between 0 and 5 and score * 2 = trunc(score * 2)),
  updated_at   timestamptz not null default now(),
  primary key (criterion_id, applicant_id, member_id)
);

-- Scoring-phase notes. criterion_id null = general notes for the round;
-- set = notes on a specific criterion (e.g. Behaviorals).
create table public.notes (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references public.rounds on delete cascade,
  applicant_id uuid not null references public.applicants on delete cascade,
  member_id    uuid not null references public.members on delete cascade,
  criterion_id uuid references public.criteria on delete cascade,
  body         text not null default '',
  updated_at   timestamptz not null default now(),
  unique nulls not distinct (round_id, applicant_id, member_id, criterion_id)
);

-- Deliberation votes from every member. Recusal = no stars.
create table public.votes (
  round_id     uuid not null references public.rounds on delete cascade,
  applicant_id uuid not null references public.applicants on delete cascade,
  member_id    uuid not null references public.members on delete cascade,
  stars        numeric(2,1) check (stars between 1 and 5 and stars * 2 = trunc(stars * 2)),
  recused      boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (round_id, applicant_id, member_id),
  check ((recused and stars is null) or (not recused and stars is not null))
);


-- ---------------------------------------------------------
-- 3. HELPER FUNCTIONS (used by the security rules)
-- ---------------------------------------------------------
create function public.current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from members
  where email = lower(auth.jwt() ->> 'email') and is_active
$$;

create function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select current_member_id() is not null
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members
    where email = lower(auth.jwt() ->> 'email') and is_active and role = 'admin'
  )
$$;

create function public.round_phase_of(p_round uuid) returns public.round_phase
language sql stable security definer set search_path = public as $$
  select phase from rounds where id = p_round
$$;

create function public.criterion_phase_of(p_criterion uuid) returns public.round_phase
language sql stable security definer set search_path = public as $$
  select r.phase from criteria c join rounds r on r.id = c.round_id
  where c.id = p_criterion
$$;

-- Assigned member, round in scoring phase, score within the criterion's range.
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

create function public.can_note(p_round uuid, p_applicant uuid, p_member uuid, p_criterion uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id() and exists (
    select 1
    from rounds r
    join assignments a on a.round_id = r.id
                      and a.applicant_id = p_applicant
                      and a.member_id = p_member
    where r.id = p_round
      and r.phase = 'scoring'
      and (p_criterion is null or exists (
        select 1 from criteria c where c.id = p_criterion and c.round_id = p_round))
  )
$$;

create function public.can_vote(p_round uuid, p_applicant uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id() and exists (
    select 1
    from rounds r
    join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
    where r.id = p_round and r.phase = 'voting'
  )
$$;


-- ---------------------------------------------------------
-- 4. ROW LEVEL SECURITY (who can see and change what)
-- ---------------------------------------------------------
alter table public.members           enable row level security;
alter table public.cycles            enable row level security;
alter table public.rounds            enable row level security;
alter table public.criteria          enable row level security;
alter table public.applicants        enable row level security;
alter table public.applicant_private enable row level security;
alter table public.round_applicants  enable row level security;
alter table public.assignments       enable row level security;
alter table public.scores            enable row level security;
alter table public.notes             enable row level security;
alter table public.votes             enable row level security;

-- Shared tables: every member can read, only admins can change.
do $$
declare t text;
begin
  foreach t in array array['members','cycles','rounds','criteria','applicants','round_applicants'] loop
    execute format(
      'create policy "members can read" on public.%I for select to authenticated using (public.is_member())', t);
    execute format(
      'create policy "admins can manage" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Contact info + extenuating circumstances: admins only.
create policy "admins only" on public.applicant_private
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Assignments: members see their own, admins manage all.
create policy "see own assignments" on public.assignments
  for select to authenticated
  using (member_id = public.current_member_id() or public.is_admin());
create policy "admins manage assignments" on public.assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Scores: private during scoring (except to admins), visible to all
-- members once the round moves to deliberation voting.
create policy "read scores" on public.scores
  for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.is_admin()
    or (public.is_member() and public.criterion_phase_of(criterion_id) in ('voting','closed','released'))
  );
create policy "write own scores" on public.scores
  for insert to authenticated
  with check (public.can_score(criterion_id, applicant_id, member_id, score));
create policy "edit own scores" on public.scores
  for update to authenticated
  using (member_id = public.current_member_id() and public.criterion_phase_of(criterion_id) = 'scoring')
  with check (public.can_score(criterion_id, applicant_id, member_id, score));
create policy "delete own scores" on public.scores
  for delete to authenticated
  using (member_id = public.current_member_id() and public.criterion_phase_of(criterion_id) = 'scoring');

-- Notes: same visibility as scores.
create policy "read notes" on public.notes
  for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.is_admin()
    or (public.is_member() and public.round_phase_of(round_id) in ('voting','closed','released'))
  );
create policy "write own notes" on public.notes
  for insert to authenticated
  with check (public.can_note(round_id, applicant_id, member_id, criterion_id));
create policy "edit own notes" on public.notes
  for update to authenticated
  using (member_id = public.current_member_id() and public.round_phase_of(round_id) = 'scoring')
  with check (public.can_note(round_id, applicant_id, member_id, criterion_id));
create policy "delete own notes" on public.notes
  for delete to authenticated
  using (member_id = public.current_member_id() and public.round_phase_of(round_id) = 'scoring');

-- Votes: you see your own; admins see live; everyone sees after release.
create policy "read votes" on public.votes
  for select to authenticated
  using (
    member_id = public.current_member_id()
    or public.is_admin()
    or (public.is_member() and public.round_phase_of(round_id) = 'released')
  );
create policy "cast own vote" on public.votes
  for insert to authenticated
  with check (public.can_vote(round_id, applicant_id, member_id));
create policy "change own vote" on public.votes
  for update to authenticated
  using (member_id = public.current_member_id() and public.round_phase_of(round_id) = 'voting')
  with check (public.can_vote(round_id, applicant_id, member_id));


-- ---------------------------------------------------------
-- 5. RESULTS AND ROUND CONTROLS
-- ---------------------------------------------------------

-- Anonymized score distribution for the blind cutoff: averages only,
-- no names or IDs. Available to members once voting is closed.
create function public.vote_distribution(p_round uuid)
returns table (avg_stars numeric, vote_count bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (is_admin() or (is_member() and round_phase_of(p_round) in ('closed','released'))) then
    raise exception 'Not allowed to view this distribution yet';
  end if;
  return query
    select round(avg(v.stars), 2), count(v.stars)
    from round_applicants ra
    left join votes v on v.round_id = ra.round_id
                     and v.applicant_id = ra.applicant_id
                     and not v.recused
    where ra.round_id = p_round
    group by ra.applicant_id
    order by 1 desc nulls last;
end $$;

-- Named results: admins anytime, members only after release.
create function public.round_results(p_round uuid)
returns table (
  applicant_id uuid, full_name text, avg_stars numeric, vote_count bigint,
  recusals bigint, avg_interview_score numeric, advanced boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not (is_admin() or (is_member() and round_phase_of(p_round) = 'released')) then
    raise exception 'Results are hidden until the round is released';
  end if;
  return query
    select
      a.id,
      a.full_name,
      round(avg(v.stars), 2),
      count(v.stars),
      count(*) filter (where v.recused),
      (select round(avg(s.score), 2)
         from scores s join criteria c on c.id = s.criterion_id
         where c.round_id = p_round and s.applicant_id = a.id),
      ra.advanced
    from round_applicants ra
    join applicants a on a.id = ra.applicant_id
    left join votes v on v.round_id = ra.round_id and v.applicant_id = ra.applicant_id
    where ra.round_id = p_round
    group by a.id, a.full_name, ra.advanced
    order by 3 desc nulls last;
end $$;

-- Apply the club's cutoff: mark who advanced, move them into the next
-- round (or mark accepted after the final round), reject the rest,
-- and release the round.
create function public.apply_cutoff(p_round uuid, p_cutoff numeric)
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
    select avg(v.stars) from votes v
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

-- Create a cycle with the four standard rounds. Pass p_copy_from to
-- reuse an earlier cycle's rounds and criteria instead of the defaults.
create function public.create_cycle(p_name text, p_copy_from uuid default null)
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

  -- Application
  insert into rounds (cycle_id, stage, sort_order, name)
  values (v_cycle, 'application', 0, 'Application') returning id into v_round;
  insert into criteria (round_id, name, sort_order, min_score, context_field) values
    (v_round, 'Resume Content',  1, 0, 'resume'),
    (v_round, 'Resume Format',   2, 0, 'resume'),
    (v_round, 'Why Net Impact?', 3, 0, 'why_net_impact'),
    (v_round, 'Social Impact',   4, 0, 'social_issue');

  -- Coffee chats
  insert into rounds (cycle_id, stage, sort_order, name)
  values (v_cycle, 'coffee_chat', 2, 'Coffee Chats') returning id into v_round;
  insert into criteria (round_id, name, sort_order, min_score) values
    (v_round, 'Social Fit',      1, 0),
    (v_round, 'Professionalism', 2, 0);

  -- R1 group case
  insert into rounds (cycle_id, stage, sort_order, name)
  values (v_cycle, 'r1', 3, 'R1: Group Case') returning id into v_round;
  insert into criteria (round_id, name, sort_order, min_score) values
    (v_round, 'Collaboration',     1, 0),
    (v_round, 'Intro / Framework', 2, 0),
    (v_round, 'Section 1',         3, 0),
    (v_round, 'Section 2 (Math)',  4, 0),
    (v_round, 'Recommendation',    5, 0);

  -- R2 final
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

-- Only signed-in users can call these (each also checks roles itself).
revoke execute on function public.vote_distribution(uuid)        from public, anon;
revoke execute on function public.round_results(uuid)            from public, anon;
revoke execute on function public.apply_cutoff(uuid, numeric)    from public, anon;
revoke execute on function public.create_cycle(text, uuid)       from public, anon;
grant  execute on function public.vote_distribution(uuid)        to authenticated;
grant  execute on function public.round_results(uuid)            to authenticated;
grant  execute on function public.apply_cutoff(uuid, numeric)    to authenticated;
grant  execute on function public.create_cycle(text, uuid)       to authenticated;


-- ---------------------------------------------------------
-- 6. TRIGGERS
-- ---------------------------------------------------------

-- New applicants automatically enter their cycle's first round.
create function public.add_to_first_round() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into round_applicants (round_id, applicant_id)
  select id, new.id from rounds
  where cycle_id = new.cycle_id
  order by sort_order limit 1
  on conflict do nothing;
  return new;
end $$;

create trigger applicants_enter_first_round
  after insert on public.applicants
  for each row execute function public.add_to_first_round();

-- Keep updated_at current.
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger scores_touch before update on public.scores
  for each row execute function public.touch_updated_at();
create trigger notes_touch  before update on public.notes
  for each row execute function public.touch_updated_at();
create trigger votes_touch  before update on public.votes
  for each row execute function public.touch_updated_at();


-- ---------------------------------------------------------
-- 7. FILE STORAGE (headshots + resumes)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('applicant-files', 'applicant-files', false)
on conflict (id) do nothing;

create policy "members read applicant files" on storage.objects
  for select to authenticated
  using (bucket_id = 'applicant-files' and public.is_member());
create policy "admins upload applicant files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'applicant-files' and public.is_admin());
create policy "admins update applicant files" on storage.objects
  for update to authenticated
  using (bucket_id = 'applicant-files' and public.is_admin());
create policy "admins delete applicant files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'applicant-files' and public.is_admin());


-- ---------------------------------------------------------
-- 8. FIRST ADMIN
-- Use the exact email you'll sign in with (lowercase).
-- ---------------------------------------------------------
insert into public.members (email, full_name, role)
values ('ryankobayashi27@g.ucla.edu', 'Ryan Kobayashi', 'admin');
