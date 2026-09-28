import Link from 'next/link';

// items: [{ key, applicantId, name, meta, done }]
export default function Queue({ title, items, doneLabel = 'done', tone = 'review' }) {
  const done = items.filter((i) => i.done).length;
  return (
    <section className={`queue queue-${tone}`} aria-label={title}>
      <div className="queue-head">
        <h2>{title}</h2>
        <span className="muted">
          {done} of {items.length} {doneLabel}
        </span>
      </div>
      <div className="queue-meter" aria-hidden="true">
        <span style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
      </div>
      <ul className="queue-list">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={`/applicants/${i.applicantId}`} className={`queue-item ${i.done ? 'queue-done' : ''}`}>
              <span className="queue-name">{i.name}</span>
              <span className="queue-meta">{i.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
