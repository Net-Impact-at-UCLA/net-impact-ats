// Evenly spreads applicants across reviewers.
// Each applicant gets up to `perApplicant` different reviewers, loads stay as
// even as possible, and nobody is assigned an applicant they have a conflict with.
// `blocked` is a Set of "applicantId|memberId" pairs to avoid.
export function distribute(applicantIds, memberIds, perApplicant, blocked = new Set(), rand = Math.random) {
  const k = Math.max(1, Math.min(perApplicant, memberIds.length));
  const apps = shuffle([...applicantIds], rand);
  const order = shuffle([...memberIds], rand);
  const load = new Map(memberIds.map((m) => [m, 0]));
  const plan = [];
  const short = [];

  for (const applicantId of apps) {
    const picks = [...order]
      .filter((m) => !blocked.has(`${applicantId}|${m}`))
      .sort((a, b) => load.get(a) - load.get(b))
      .slice(0, k);
    for (const memberId of picks) {
      load.set(memberId, load.get(memberId) + 1);
      plan.push({ applicant_id: applicantId, member_id: memberId });
    }
    if (picks.length < k) short.push(applicantId);
    order.push(order.shift());
  }
  return { plan, load: Object.fromEntries(load), short };
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
