// Horizontal bars: each reviewer's average on a 0-5 scale, with the club average marked.
export default function GraderChart({ rows, clubAvg }) {
  const pct = (v) => `${(v / 5) * 100}%`;
  return (
    <figure className="gchart" aria-label={`Reviewer averages. Club average ${clubAvg.toFixed(2)} out of 5.`}>
      <div className="gchart-rows">
        {rows.map((r) => (
          <div key={r.id} className="gchart-row">
            <span className="gchart-name">{r.name}</span>
            <span className="gchart-track">
              <span
                className={`gchart-bar ${r.diff > 0.25 ? 'gchart-up' : r.diff < -0.25 ? 'gchart-down' : ''}`}
                style={{ width: pct(r.avg) }}
              />
              <span className="gchart-club" style={{ left: pct(clubAvg) }} aria-hidden="true" />
            </span>
            <span className="gchart-val">{r.avg.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="gchart-axis" aria-hidden="true">
        <span className="gchart-name" />
        <span className="gchart-ticks">
          {[0, 1, 2, 3, 4, 5].map((t) => (
            <span key={t} style={{ left: pct(t) }}>{t}</span>
          ))}
          <span className="gchart-club-label" style={{ left: pct(clubAvg) }}>
            Club avg {clubAvg.toFixed(2)}
          </span>
        </span>
        <span className="gchart-val" />
      </div>
    </figure>
  );
}
