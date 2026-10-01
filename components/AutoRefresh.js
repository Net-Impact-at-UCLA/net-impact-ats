'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Quietly reloads the page's data every `seconds` while the tab is visible.
// Client state (searches, selections, typing) is kept.
export default function AutoRefresh({ seconds = 15, label = true }) {
  const router = useRouter();
  const [last, setLast] = useState(() => Date.now());
  const [, tick] = useState(0);

  useEffect(() => {
    let timer;
    const run = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
        setLast(Date.now());
      }
    };
    timer = setInterval(run, seconds * 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    const clock = setInterval(() => tick((n) => n + 1), 5000);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router, seconds]);

  if (!label) return null;
  const ago = Math.round((Date.now() - last) / 1000);
  return (
    <span className="live" title={`Updates automatically every ${seconds} seconds`}>
      <span className="live-dot" aria-hidden="true" />
      Live{ago >= 5 ? `, updated ${ago}s ago` : ''}
    </span>
  );
}
