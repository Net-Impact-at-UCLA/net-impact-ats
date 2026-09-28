// Shows how far an applicant has progressed through the rounds.
// reachedIndex = index of the furthest round they're in.
export default function StageTrack({ rounds, reachedIndex, status, showLabels = false }) {
  const out = status === 'rejected' || status === 'withdrawn';
  const current = rounds[reachedIndex];
  const summary = current
    ? `${current.name}${status === 'rejected' ? ', not advanced' : ''}${status === 'accepted' ? ', accepted' : ''}`
    : 'Not started';

  return (
    <ol
      className={`track ${showLabels ? 'track-labeled' : ''} ${out ? 'track-out' : ''} ${status === 'accepted' ? 'track-accepted' : ''}`}
      aria-label={`Progress: ${summary}`}
    >
      {rounds.map((r, i) => {
        const state = i < reachedIndex ? 'done' : i === reachedIndex ? 'current' : 'ahead';
        return (
          <li key={r.id} className={`track-step track-${state}`}>
            <span className="track-bar" />
            {showLabels && <span className="track-label">{r.name}</span>}
          </li>
        );
      })}
    </ol>
  );
}
