// Works out each applicant's furthest round from round_applicants rows.
export function withProgress(applicants, rounds, roundApplicants) {
  const orderById = Object.fromEntries(rounds.map((r, i) => [r.id, i]));
  const furthest = {};
  roundApplicants.forEach((ra) => {
    const idx = orderById[ra.round_id];
    if (idx === undefined) return;
    if (furthest[ra.applicant_id] === undefined || idx > furthest[ra.applicant_id]) {
      furthest[ra.applicant_id] = idx;
    }
  });
  return applicants.map((a) => {
    const reachedIndex = furthest[a.id] ?? 0;
    return { ...a, reachedIndex, currentRoundId: rounds[reachedIndex]?.id ?? null };
  });
}
