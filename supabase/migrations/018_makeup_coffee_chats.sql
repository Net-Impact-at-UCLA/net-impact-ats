-- =========================================================
-- Update 018: makeup coffee chats. Admins mark applicants as makeups; they
-- are held out of the vote and cutoff, stay gradable on My table after
-- scoring closes, and are decided separately. Run once in the SQL Editor.
-- =========================================================
alter table public.round_applicants add column if not exists makeup boolean not null default false;

-- Can this applicant be graded in this round right now?
-- Normal scoring, or a pending makeup in a coffee chat round at any later stage.
create or replace function public.grading_open(p_round uuid, p_applicant uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from rounds r
    left join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
    where r.id = p_round
      and (r.phase = 'scoring'
           or (r.stage = 'coffee_chat' and r.phase in ('voting', 'closed', 'released')
               and ra.makeup and ra.advanced is null))
  )
$$;

create or replace function public.can_score(p_criterion uuid, p_applicant uuid, p_member uuid, p_score numeric)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id() and exists (
    select 1
    from criteria c
    join rounds r      on r.id = c.round_id
    join assignments a on a.round_id = r.id and a.applicant_id = p_applicant and a.member_id = p_member
    where c.id = p_criterion
      and grading_open(r.id, p_applicant)
      and p_score between c.min_score and c.max_score
  )
$$;

create or replace function public.can_note(p_round uuid, p_applicant uuid, p_member uuid, p_criterion uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id() and exists (
    select 1
    from rounds r
    join assignments a on a.round_id = r.id and a.applicant_id = p_applicant and a.member_id = p_member
    where r.id = p_round
      and grading_open(r.id, p_applicant)
      and (p_criterion is null or exists (select 1 from criteria c where c.id = p_criterion and c.round_id = p_round))
  )
$$;

create or replace function public.can_self_assign(p_round uuid, p_applicant uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id()
    and not exists (select 1 from conflicts c where c.applicant_id = p_applicant and c.member_id = p_member)
    and exists (
      select 1
      from rounds r
      join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
      join applicants a on a.id = p_applicant and a.status = 'active'
      where r.id = p_round and r.stage = 'coffee_chat'
    )
    and grading_open(p_round, p_applicant)
$$;

drop policy if exists "edit own scores" on public.scores;
create policy "edit own scores" on public.scores
  for update to authenticated
  using (member_id = public.current_member_id()
         and public.grading_open((select round_id from criteria where id = criterion_id), applicant_id))
  with check (public.can_score(criterion_id, applicant_id, member_id, score));
drop policy if exists "delete own scores" on public.scores;
create policy "delete own scores" on public.scores
  for delete to authenticated
  using (member_id = public.current_member_id()
         and public.grading_open((select round_id from criteria where id = criterion_id), applicant_id));
drop policy if exists "edit own notes" on public.notes;
create policy "edit own notes" on public.notes
  for update to authenticated
  using (member_id = public.current_member_id() and public.grading_open(round_id, applicant_id))
  with check (public.can_note(round_id, applicant_id, member_id, criterion_id));
drop policy if exists "delete own notes" on public.notes;
create policy "delete own notes" on public.notes
  for delete to authenticated
  using (member_id = public.current_member_id() and public.grading_open(round_id, applicant_id));

create or replace function public.remove_from_table(p_round uuid, p_applicant uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me uuid := current_member_id();
begin
  if v_me is null then raise exception 'Not on the roster'; end if;
  if not exists (select 1 from rounds where id = p_round and stage = 'coffee_chat') or not grading_open(p_round, p_applicant) then
    raise exception 'Coffee chat grading is not open for this applicant';
  end if;
  delete from scores s using criteria c
  where c.id = s.criterion_id and c.round_id = p_round and s.applicant_id = p_applicant and s.member_id = v_me;
  delete from notes where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
  delete from assignments where round_id = p_round and applicant_id = p_applicant and member_id = v_me;
end $$;

-- Admin: mark or unmark a makeup (before they're decided)
create or replace function public.set_makeup(p_round uuid, p_applicant uuid, p_on boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  if not exists (select 1 from rounds where id = p_round and stage = 'coffee_chat') then
    raise exception 'Makeups are only for coffee chats';
  end if;
  if not exists (select 1 from round_applicants where round_id = p_round and applicant_id = p_applicant and advanced is null) then
    raise exception 'This applicant has already been decided for this round';
  end if;
  if not p_on and exists (select 1 from rounds where id = p_round and phase = 'released') then
    raise exception 'Results are already released; decide this makeup with the buttons on the round page instead';
  end if;
  update round_applicants set makeup = p_on where round_id = p_round and applicant_id = p_applicant;
  if p_on then
    -- held out of the vote: drop any votes already cast on them
    delete from votes where round_id = p_round and applicant_id = p_applicant;
  end if;
end $$;

-- Admin: decide a makeup after the main results are out (advance, not advance, or undo)
create or replace function public.decide_makeup(p_round uuid, p_applicant uuid, p_decision text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds%rowtype;
  v_next  public.rounds%rowtype;
  v_ra    public.round_applicants%rowtype;
begin
  if not is_admin() then raise exception 'Only admins can do this'; end if;
  select * into v_round from rounds where id = p_round;
  if v_round.phase <> 'released' then raise exception 'Apply the main cutoff first, then decide makeups'; end if;
  select * into v_ra from round_applicants where round_id = p_round and applicant_id = p_applicant;
  if not coalesce(v_ra.makeup, false) then raise exception 'Not a makeup'; end if;
  select * into v_next from rounds where cycle_id = v_round.cycle_id and sort_order > v_round.sort_order order by sort_order limit 1;

  -- undo any previous advance first (only if untouched in the next round)
  if v_ra.advanced and v_next.id is not null then
    if exists (select 1 from assignments where round_id = v_next.id and applicant_id = p_applicant)
       or exists (select 1 from scores s join criteria c on c.id = s.criterion_id where c.round_id = v_next.id and s.applicant_id = p_applicant)
       or exists (select 1 from notes where round_id = v_next.id and applicant_id = p_applicant)
       or exists (select 1 from votes where round_id = v_next.id and applicant_id = p_applicant) then
      raise exception 'They already have activity in %, so this can no longer be changed', v_next.name;
    end if;
    delete from round_applicants where round_id = v_next.id and applicant_id = p_applicant;
  end if;

  if p_decision = 'advance' then
    update round_applicants set advanced = true where round_id = p_round and applicant_id = p_applicant;
    if v_next.id is not null then
      insert into round_applicants (round_id, applicant_id) values (v_next.id, p_applicant) on conflict do nothing;
      update applicants set status = 'active' where id = p_applicant;
    else
      update applicants set status = 'accepted' where id = p_applicant;
    end if;
  elsif p_decision = 'out' then
    update round_applicants set advanced = false where round_id = p_round and applicant_id = p_applicant;
    update applicants set status = 'rejected' where id = p_applicant;
  elsif p_decision = 'pending' then
    update round_applicants set advanced = null where round_id = p_round and applicant_id = p_applicant;
    update applicants set status = 'active' where id = p_applicant;
  else
    raise exception 'Unknown decision';
  end if;
end $$;

revoke execute on function public.set_makeup(uuid, uuid, boolean) from public, anon;
grant  execute on function public.set_makeup(uuid, uuid, boolean) to authenticated;
revoke execute on function public.decide_makeup(uuid, uuid, text) from public, anon;
grant  execute on function public.decide_makeup(uuid, uuid, text) to authenticated;

-- Hold makeups out of the vote, the chart, the results, and the cutoff
create or replace function public.can_vote(p_round uuid, p_applicant uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id()
    and round_phase_of(p_round) = 'voting'
    and exists (select 1 from round_applicants ra where ra.round_id = p_round and ra.applicant_id = p_applicant and not ra.makeup)
    and not exists (select 1 from conflicts c where c.applicant_id = p_applicant and c.member_id = p_member)
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
    where ra.round_id = p_round and not ra.makeup
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
    where ra.round_id = p_round and not ra.makeup
    order by 3 desc nulls last;
end $$;

create or replace function public.apply_cutoff(p_round uuid, p_cutoff numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds%rowtype;
  v_next  uuid;
begin
  if not is_admin() then raise exception 'Only admins can apply a cutoff'; end if;
  select * into v_round from rounds where id = p_round;
  if v_round.phase <> 'closed' then raise exception 'Close the round before applying a cutoff'; end if;

  update round_applicants ra
  set advanced = ra.advance_override or coalesce(round_avg(p_round, ra.applicant_id) >= p_cutoff, false)
  where ra.round_id = p_round and not ra.makeup;

  select id into v_next from rounds
  where cycle_id = v_round.cycle_id and sort_order > v_round.sort_order
  order by sort_order limit 1;

  if v_next is not null then
    insert into round_applicants (round_id, applicant_id)
    select v_next, applicant_id from round_applicants
    where round_id = p_round and advanced and not makeup
    on conflict do nothing;
  else
    update applicants set status = 'accepted'
    where id in (select applicant_id from round_applicants where round_id = p_round and advanced and not makeup);
  end if;

  update applicants set status = 'rejected'
  where status = 'active'
    and id in (select applicant_id from round_applicants where round_id = p_round and advanced = false and not makeup);

  update rounds set cutoff = p_cutoff, phase = 'released' where id = p_round;
end $$;

notify pgrst, 'reload schema';
