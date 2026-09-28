import Link from 'next/link';

export default function Queue({ items }) {
  const done = items.filter((i) => i.total > 0 && i.scored >= i.total).length;
  return (
    <section className="queue" aria-labelledby="queue-title">
      <div className="queue-head">
        <h2 id="queue-title">Your queue</h2>
        <span className="muted">
          {done} of {items.length} done
        </span>
      </div>
      <div className="queue-meter" aria-hidden="true">
        <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="queue-list">
        {items.map((i) => {
          const complete = i.total > 0 && i.scored >= i.total;
          return (
            <li key={`${i.applicantId}-${i.roundName}`}>
              <Link href={`/applicants/${i.applicantId}`} className={`queue-item ${complete ? 'queue-done' : ''}`}>
                <span className="queue-name">{i.name}</span>
                <span className="queue-meta">
                  {i.roundName}, {complete ? 'done' : i.scored ? `${i.scored} of ${i.total} scored` : 'not started'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
