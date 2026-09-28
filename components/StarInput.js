'use client';

import { useState } from 'react';

// 1-5 stars, plus a "0" option when the criterion allows it.
export default function StarInput({ value, min = 1, max = 5, onChange, label, disabled }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? value ?? null;
  const stars = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className="stars" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(null)}>
      {min === 0 && (
        <button
          type="button"
          role="radio"
          aria-checked={value === 0}
          aria-label="0 stars"
          className={`star-zero ${value === 0 ? 'star-zero-on' : ''}`}
          onClick={() => onChange(0)}
          disabled={disabled}
        >
          0
        </button>
      )}
      {stars.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          className={`star ${shown != null && n <= shown ? 'star-on' : ''}`}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(null)}
          onClick={() => onChange(n)}
          disabled={disabled}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" />
          </svg>
        </button>
      ))}
    </div>
  );
}
