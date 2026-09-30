// Evenly spreads applicants across reviewers.
// Each applicant gets up to `perApplicant` different reviewers, loads stay as
// even as possible, and nobody is assigned an applicant they have a conflict with.
// `blocked` is a Set of "applicantId|memberId" pairs to avoid.
// `initialLoad` gives reviewers' existing assignment counts, so topping up
// new applicants keeps everyone's totals even.
// `weights` (e.g. { memberId: 2 }) gives someone a proportionally bigger share.
export function distribute(applicantIds, memberIds, perApplicant, blocked = new Set(), rand = Math.random, initialLoad = {}, weights = {}) {
  const k = Math.max(1, Math.min(perApplicant, memberIds.length));
  const apps = shuffle([...applicantIds], rand);
  const order = shuffle([...memberIds], rand);
  const load = new Map(memberIds.map((m) => [m, initialLoad[m] || 0]));
  const plan = [];
  const short = [];

  for (const applicantId of apps) {
    const picks = [...order]
      .filter((m) => !blocked.has(`${applicantId}|${m}`))
      .sort((a, b) => (load.get(a) + 1) / (weights[a] || 1) - (load.get(b) + 1) / (weights[b] || 1))
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
