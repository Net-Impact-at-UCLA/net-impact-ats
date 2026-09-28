// Evenly spreads applicants across reviewers.
// Each applicant gets `perApplicant` different reviewers, and every
// reviewer's load differs from any other's by at most one.
export function distribute(applicantIds, memberIds, perApplicant, rand = Math.random) {
  const k = Math.max(1, Math.min(perApplicant, memberIds.length));
  const apps = shuffle([...applicantIds], rand);
  const order = shuffle([...memberIds], rand);
  const load = new Map(memberIds.map((m) => [m, 0]));
  const plan = [];

  for (const applicantId of apps) {
    // Least-loaded reviewers first; ties broken by a rotating order.
    const picks = [...order].sort((a, b) => load.get(a) - load.get(b)).slice(0, k);
    for (const memberId of picks) {
      load.set(memberId, load.get(memberId) + 1);
      plan.push({ applicant_id: applicantId, member_id: memberId });
    }
    order.push(order.shift());
  }
  return { plan, load: Object.fromEntries(load) };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
