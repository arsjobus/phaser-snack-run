import { CHECKPOINT } from '../config';

/** Distance (m from the start) of checkpoint `index` (1-based). Segments grow: 1000, 1150, 1300... */
export function checkpointMeters(index: number): number {
  if (index <= 0) return 0;
  return index * CHECKPOINT.firstMeters + (CHECKPOINT.growthMeters * index * (index - 1)) / 2;
}

/** Length (m) of the segment that ends at checkpoint `index`. */
export function segmentMeters(index: number): number {
  return CHECKPOINT.firstMeters + (index - 1) * CHECKPOINT.growthMeters;
}

/** How generous the clock is for the segment that ends at checkpoint `index` (1.5x a good player's time at first, then tighter). */
export function segmentSlack(index: number): number {
  return Math.max(CHECKPOINT.slackFloor, CHECKPOINT.slackFirst - CHECKPOINT.slackStep * (index - 1));
}

/**
 * Clock time granted for the segment that ends at checkpoint `index`: what a good player needs
 * for its length, times the slack. The first is 90 s; the later ones stay a fixed share above
 * what the same player needs, so the clock keeps its teeth.
 */
export function segmentSeconds(index: number): number {
  return (segmentMeters(index) / CHECKPOINT.playerMps) * segmentSlack(index);
}

export type CheckpointEvent =
  | { type: 'reached'; index: number; timeAdded: number; points: number }
  | { type: 'timeup' };

/**
 * The checkpoint clock. Counts down while driving; reaching the next checkpoint banks (up to a cap) the time
 * left, adds the next segment's allowance and pays a bonus. Pure TypeScript.
 */
export class CheckpointTrack {
  /** Checkpoints reached so far. */
  reached = 0;
  timeLeft = segmentSeconds(1);
  timedOut = false;

  get nextIndex(): number {
    return this.reached + 1;
  }

  get nextMeters(): number {
    return checkpointMeters(this.nextIndex);
  }

  get prevMeters(): number {
    return checkpointMeters(this.reached);
  }

  /** 0..1 progress through the current segment. */
  progress(meters: number): number {
    const span = this.nextMeters - this.prevMeters;
    return Math.min(1, Math.max(0, (meters - this.prevMeters) / span));
  }

  update(dt: number, meters: number): CheckpointEvent[] {
    const events: CheckpointEvent[] = [];
    if (this.timedOut) return events;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    // Reaching a gate on the same frame the clock hits zero still counts.
    while (meters >= this.nextMeters) {
      const index = this.nextIndex;
      const points = Math.round(
        CHECKPOINT.basePoints + this.timeLeft * CHECKPOINT.pointsPerSecondLeft,
      );
      const timeAdded = segmentSeconds(index + 1);
      // The BONUS pays for every second left, but only `carryCap` of them roll into the next
      // segment, so a long lead early on cannot make the clock meaningless later.
      this.timeLeft = Math.min(this.timeLeft, CHECKPOINT.carryCap) + timeAdded;
      this.reached = index;
      events.push({ type: 'reached', index, timeAdded, points });
    }
    if (this.timeLeft <= 0) {
      this.timedOut = true;
      events.push({ type: 'timeup' });
    }
    return events;
  }
}
