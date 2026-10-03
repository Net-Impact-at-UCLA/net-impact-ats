-- =========================================================
-- Update 013: any member can use "Review this applicant" on a profile
-- (previously admins and extra reviewers only). Run once in the SQL Editor.
-- =========================================================
create or replace function public.can_self_review(p_round uuid, p_applicant uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_member = current_member_id()
    and not exists (select 1 from conflicts c where c.applicant_id = p_applicant and c.member_id = p_member)
    and exists (
      select 1
      from rounds r
      join round_applicants ra on ra.round_id = r.id and ra.applicant_id = p_applicant
      join applicants a on a.id = p_applicant and a.status = 'active'
      where r.id = p_round and r.stage <> 'coffee_chat' and r.phase in ('setup', 'scoring')
    )
$$;
