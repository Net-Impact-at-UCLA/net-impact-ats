'use client';

import { useState } from 'react';

const STAR_PATH = 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z';

function fmt(v) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Half-star rating. Click the left half of a star for .5, the right half for a whole star.
// Criteria that allow 0 also get a "0" button in front.
export default function StarInput({ value, min = 1, max = 5, onChange, label, disabled }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value ?? null;
  const current = value == null ? null : Number(value);

  return (
    <div className="stars" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(null)}>
      {min === 0 && (
        <button
          type="button"
          role="radio"
          aria-checked={current === 0}
          aria-label="0 stars"
          className={`star-zero ${current === 0 ? 'star-zero-on' : ''}`}
          onClick={() => onChange(0)}
          disabled={disabled}
        >
          0
        </button>
      )}
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const half = Math.max(n - 0.5, min === 0 ? 0.5 : min);
        const fill = shown == null ? 0 : shown >= n ? 100 : shown >= n - 0.5 ? 50 : 0;
        return (
          <span key={n} className="star">
            <svg viewBox="0 0 24 24" className="star-outline" aria-hidden="true"><path d={STAR_PATH} /></svg>
            <span className="star-fill" style={{ width: `${fill}%` }} aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d={STAR_PATH} /></svg>
            </span>
            {[half, n].map((v, side) => (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={current === v}
                aria-label={`${fmt(v)} stars`}
                className={`star-hit ${side === 0 ? 'star-hit-left' : 'star-hit-right'}`}
                onMouseEnter={() => setHover(v)}
                onFocus={() => setHover(v)}
                onBlur={() => setHover(null)}
                onClick={() => onChange(v)}
                disabled={disabled}
              />
            ))}
          </span>
        );
      })}
      <span className="star-value" aria-hidden="true">{shown == null ? '' : fmt(Number(shown))}</span>
    </div>
  );
}
