import Link from 'next/link';
import { setRoundPhase, setDecideBy } from '@/app/admin/actions';
import ConfirmButton from './ConfirmButton';
import ReopenCutoffButton from './ReopenCutoffButton';

const VOTE_STEPS = [
  { key: 'setup', label: 'Not started' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'voting', label: 'Voting' },
  { key: 'closed', label: 'Cutoff' },
  { key: 'released', label: 'Results' },
];
const SCORE_STEPS = [
  { key: 'setup', label: 'Not started' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'closed', label: 'Cut line' },
  { key: 'released', label: 'Results' },
];

function PhaseButton({ roundId, to, primary, disabled, confirm, children }) {
  const cls = `btn ${primary ? 'btn-primary' : 'btn-quiet'}`;
  return (
    <form action={setRoundPhase}>
      <input type="hidden" name="roundId" value={roundId} />
      <input type="hidden" name="phase" value={to} />
      {confirm ? (
        <ConfirmButton className={cls} message={confirm} disabled={disabled}>{children}</ConfirmButton>
      ) : (
        <button className={cls} disabled={disabled}>{children}</button>
      )}
    </form>
  );
}

// Admin-only control bar on a round's page.
// stats: { applicants, assigned, reviewsDone, votesCast, voters }
export default function RoundControls({ round, nextRoundName, stats }) {
  const byScores = round.decide_by === 'scores';
  const STEPS = byScores ? SCORE_STEPS : VOTE_STEPS;
  const idx = STEPS.findIndex((s) => s.key === round.phase);
  const isCoffee = round.stage === 'coffee_chat';
  const noReviewers = stats.assigned === 0 && !isCoffee;

  let next = '';
  if (round.phase === 'setup') {
    next = isCoffee
      ? `${stats.applicants} applicant${stats.applicants === 1 ? '' : 's'} in this round. Open scoring when coffee chats start; members add people at their tables.`
      : noReviewers
        ? `${stats.applicants} applicant${stats.applicants === 1 ? '' : 's'} in this round, but no reviewers are assigned yet. Assign reviewers on the Admin page first.`
        : `${stats.assigned} review${stats.assigned === 1 ? '' : 's'} assigned. Open scoring when reviewers should start.`;
  } else if (round.phase === 'scoring' && byScores) {
    next = `Reviews are ${stats.reviewsDone} of ${stats.assigned} done. When scoring is finished, close it to set the cut line on average review scores. A live preview is below.`;
  } else if (round.phase === 'scoring') {
    next = isCoffee
      ? `Members are grading at their tables (${stats.reviewsDone} chat${stats.reviewsDone === 1 ? '' : 's'} fully scored so far). When coffee chats are over and the club is ready to deliberate, open voting.`
      : `Reviews are ${stats.reviewsDone} of ${stats.assigned} done. When the club is ready to deliberate, open voting.`;
  } else if (round.phase === 'voting') {
    next = `Voting is open (${stats.votesCast} vote${stats.votesCast === 1 ? '' : 's'} cast so far). After discussing everyone, close voting to reveal the blind cutoff chart.`;
  } else if (round.phase === 'closed' && byScores) {
    next = 'Scoring is closed. Move the cut line, push through anyone below it the club wants to keep, then apply it at the bottom.';
  } else if (round.phase === 'closed') {
    next = 'Everyone can now see the anonymous averages below. Agree on a cutoff, then apply it at the bottom of the chart.';
  } else {
    next = `Results are released${nextRoundName ? ` and advancing applicants are in ${nextRoundName}` : ''}. Download the export for the Advancing list. Need to change the line? Reopen it, as long as ${nextRoundName || 'the next round'} hasn't started.`;
  }

  return (
    <section className="round-controls" aria-label="Round controls (admins only)">
      <ol className="steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`step ${i < idx ? 'step-done' : i === idx ? 'step-now' : ''}`}>
            <span className="step-dot" aria-hidden="true">{i < idx ? '✓' : i + 1}</span>
            <span className="step-label">{s.label}</span>
          </li>
        ))}
      </ol>
      <p className="round-next">{next}</p>
      {['setup', 'scoring'].includes(round.phase) && !isCoffee && (
        <form action={setDecideBy} className="decide-by">
          <input type="hidden" name="roundId" value={round.id} />
          <span className="field-label">Decide who advances by:</span>
          <button name="mode" value="scores" className={`seg ${byScores ? 'seg-on' : ''}`} disabled={byScores}>Average review score</button>
          <button name="mode" value="votes" className={`seg ${!byScores ? 'seg-on' : ''}`} disabled={!byScores}>Deliberation vote</button>
        </form>
      )}
      <div className="round-control-buttons">
        {round.phase === 'setup' && (
          <>
            <PhaseButton roundId={round.id} to="scoring" primary disabled={noReviewers}>Open scoring</PhaseButton>
            {!isCoffee && <Link href="/admin" className="btn btn-quiet">Assign reviewers</Link>}
          </>
        )}
        {round.phase === 'scoring' && byScores && (
          <>
            <PhaseButton
              roundId={round.id}
              to="closed"
              primary
              confirm={`Close scoring for ${round.name} and set the cut line? Reviewers can no longer change scores (you can reopen scoring if needed).`}
            >
              Close scoring and set cut line
            </PhaseButton>
            <PhaseButton roundId={round.id} to="setup">Pause scoring</PhaseButton>
          </>
        )}
        {round.phase === 'scoring' && !byScores && (
          <>
            <PhaseButton
              roundId={round.id}
              to="voting"
              primary
              confirm={`Open deliberation voting for ${round.name}? Scoring closes, and every member can see the scores and notes and vote.`}
            >
              Open voting
            </PhaseButton>
            <PhaseButton roundId={round.id} to="setup">Pause scoring</PhaseButton>
          </>
        )}
        {round.phase === 'voting' && (
          <>
            <PhaseButton
              roundId={round.id}
              to="closed"
              primary
              confirm={`Close voting for ${round.name}? Members will see the anonymous averages for the blind cutoff.`}
            >
              Close voting
            </PhaseButton>
            <Link href="/deliberate" className="btn btn-quiet">Deliberations</Link>
            <Link href="/deliberate/present" className="btn btn-quiet" target="_blank">Open TV view</Link>
            <PhaseButton roundId={round.id} to="scoring" confirm={`Go back to scoring for ${round.name}? Voting pauses; votes already cast are kept.`}>
              Back to scoring
            </PhaseButton>
          </>
        )}
        {round.phase === 'closed' && byScores && (
          <PhaseButton roundId={round.id} to="scoring" confirm={`Reopen scoring for ${round.name}? Reviewers can score again; anyone pushed through stays pushed.`}>
            Reopen scoring
          </PhaseButton>
        )}
        {round.phase === 'closed' && !byScores && (
          <PhaseButton roundId={round.id} to="voting" confirm={`Reopen voting for ${round.name}? The cutoff chart is hidden again until voting closes.`}>
            Reopen voting
          </PhaseButton>
        )}
        {round.phase === 'released' && (
          <>
            <a href="/admin/export" className="btn btn-quiet" download>Download results (.xlsx)</a>
            <ReopenCutoffButton roundId={round.id} roundName={round.name} nextRoundName={nextRoundName} label={byScores ? 'cut line' : 'cutoff'} />
          </>
        )}
      </div>
    </section>
  );
}
