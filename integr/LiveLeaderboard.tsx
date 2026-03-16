/**
 * LiveLeaderboard.tsx
 * ────────────────────
 * Leaderboard that shows the user (YOU) + 20 real F1 drivers.
 * The user entry updates live with every scoring event.
 */

import type { LeaderboardEntry } from "../hooks/useLiveRace";
import { USER_DRIVER_NUMBER } from "../hooks/useLiveRace";
import styles from "./LiveLeaderboard.module.css";

interface Props {
  leaderboard: LeaderboardEntry[];
  totalLaps: number;
}

export function LiveLeaderboard({ leaderboard, totalLaps }: Props) {
  return (
    <div className={styles.board}>
      <div className={styles.title}>Leaderboard</div>
      {leaderboard.map((entry, idx) => {
        const isUser = entry.driverNumber === USER_DRIVER_NUMBER;
        return (
          <div
            key={entry.driverNumber}
            className={`${styles.row} ${isUser ? styles.userRow : ""} ${entry.isOut ? styles.out : ""}`}
          >
            <span className={styles.pos}>{idx + 1}.</span>
            <span
              className={styles.acronym}
              style={{ color: entry.teamColor }}
            >
              {entry.acronym}
            </span>
            {entry.isOut && <span className={styles.outTag}>OUT</span>}
            <span className={styles.lap}>L{entry.lap}</span>
          </div>
        );
      })}
    </div>
  );
}
