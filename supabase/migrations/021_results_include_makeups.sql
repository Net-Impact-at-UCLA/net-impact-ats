-- =========================================================
-- Update 021: decided makeups appear in the round's results (flagged).
-- Run once in Supabase > SQL Editor.
-- =========================================================
drop function if exists public.round_results(uuid);
create function public.round_results(p_round uuid)
returns table (
  applicant_id uuid, full_name text, avg_stars numeric, vote_count bigint,
  recusals bigint, avg_interview_score numeric, advanced boolean, by_vouch boolean, is_makeup boolean
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
      ra.advance_override,
      ra.makeup
    from round_applicants ra
    join applicants a on a.id = ra.applicant_id
    where ra.round_id = p_round and (not ra.makeup or ra.advanced is not null)
    order by ra.makeup, 3 desc nulls last;
end $$;
revoke execute on function public.round_results(uuid) from public, anon;
grant  execute on function public.round_results(uuid) to authenticated;
notify pgrst, 'reload schema';
