-- =========================================================
-- Update 011: "Review more applicants". Any member can add a batch of
-- applicants to their own queue, picking those with the fewest finished
-- reviews first. Run once in Supabase > SQL Editor.
-- =========================================================
create or replace function public.claim_more_reviews(p_round uuid, p_count int)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid := current_member_id();
  v_need  int;
  v_added int;
begin
  if v_me is null then raise exception 'Not on the roster'; end if;
  if p_count is null or p_count < 1 or p_count > 25 then raise exception 'Pick between 1 and 25'; end if;
  if not exists (select 1 from rounds where id = p_round and phase = 'scoring' and stage <> 'coffee_chat') then
    raise exception 'Scoring is not open for this round';
  end if;

  select count(*) into v_need from criteria where round_id = p_round;

  with finished as (
    select s.applicant_id, s.member_id
    from scores s join criteria c on c.id = s.criterion_id
    where c.round_id = p_round
    group by s.applicant_id, s.member_id
    having count(*) >= v_need
  ),
  pool as (
    select ra.applicant_id,
           (select count(*) from finished f where f.applicant_id = ra.applicant_id) as done,
           (select count(*) from assignments x where x.round_id = p_round and x.applicant_id = ra.applicant_id) as queued
    from round_applicants ra
    join applicants a on a.id = ra.applicant_id and a.status = 'active'
    where ra.round_id = p_round
      and not exists (select 1 from assignments x where x.round_id = p_round and x.applicant_id = ra.applicant_id and x.member_id = v_me)
      and not exists (select 1 from conflicts c where c.applicant_id = ra.applicant_id and c.member_id = v_me)
  ),
  picked as (
    select applicant_id from pool order by done, queued, random() limit p_count
  ),
  ins as (
    insert into assignments (round_id, applicant_id, member_id, self_added)
    select p_round, applicant_id, v_me, true from picked
    returning 1
  )
  select count(*) into v_added from ins;

  return v_added;
end $$;

revoke execute on function public.claim_more_reviews(uuid, int) from public, anon;
grant  execute on function public.claim_more_reviews(uuid, int) to authenticated;
