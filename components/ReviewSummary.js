// Reviewers' scores and notes for one applicant in one round, shown as context
// during deliberations (and to admins anytime).
function fmt(v) {
  const n = Number(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function ReviewSummary({ round, criteria, reviewers }) {
  // reviewers: [{ id, name, scores: { [criterionId]: n }, notes: { general, [criterionId] } }]
  const withData = reviewers.filter((r) => Object.keys(r.scores).length || Object.values(r.notes).some(Boolean));
  const all = withData.flatMap((r) => Object.values(r.scores).map(Number));
  const overall = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;

  return (
    <section className="block review-summary">
      <div className="block-head">
        <h2>Reviewer scores: {round.name}</h2>
        {overall != null && <span className="review-overall">Average {overall.toFixed(2)}</span>}
      </div>
      {withData.length === 0 ? (
        <p className="muted">No reviewer scores or notes for this round.</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="table review-table">
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  {withData.map((r) => (
                    <th key={r.id} scope="col" className="num">{r.name}</th>
                  ))}
                  <th scope="col" className="num">Avg</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((c) => {
                  const vals = withData.map((r) => r.scores[c.id]).filter((v) => v != null).map(Number);
                  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                  return (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      {withData.map((r) => (
                        <td key={r.id} className="num">{r.scores[c.id] != null ? fmt(r.scores[c.id]) : '·'}</td>
                      ))}
                      <td className="num review-avg">{avg != null ? avg.toFixed(2) : '·'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="review-notes">
            {withData.map((r) => {
              const noteItems = [
                ...criteria.filter((c) => r.notes[c.id]).map((c) => ({ label: c.name, body: r.notes[c.id] })),
                ...(r.notes.general ? [{ label: 'Overall', body: r.notes.general }] : []),
              ];
              if (!noteItems.length) return null;
              return (
                <div key={r.id} className="review-note">
                  <h3>{r.name}</h3>
                  {noteItems.map((n) => (
                    <p key={n.label} className="prose">
                      <strong>{n.label}:</strong> {n.body}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
