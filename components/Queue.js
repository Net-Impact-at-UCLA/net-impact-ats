import Link from 'next/link';
import ReviewMoreButton from './ReviewMoreButton';

// items: [{ key, applicantId, name, meta, done }]
export default function Queue({ title, items, doneLabel = 'done', tone = 'review', reviewMore = null }) {
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
      {reviewMore && <ReviewMoreButton roundId={reviewMore.id} roundName={reviewMore.name} />}
      {items.length === 0 && reviewMore && (
        <p className="muted queue-empty">Nothing in your queue yet. Add some applicants above to start reviewing.</p>
      )}
      <ul className="queue-list">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href || `/applicants/${i.applicantId}`} className={`queue-item ${i.done ? 'queue-done' : ''}`}>
              <span className="queue-name">{i.name}</span>
              <span className="queue-meta">{i.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
