import type { LeaderboardEntry } from "./useLiveRace";
import { USER_DRIVER_NUMBER } from "./useLiveRace";

interface Props {
  leaderboard: LeaderboardEntry[];
}

export function LiveLeaderboard({ leaderboard }: Props) {
  return (
    <div className="live-board">
      <div className="live-board-title">Leaderboard</div>
      <div className="live-board-list">
        {leaderboard.map((entry, index) => {
          const isUser = entry.driverNumber === USER_DRIVER_NUMBER;
          return (
            <div
              key={entry.driverNumber}
              className={`live-board-row${isUser ? " is-user" : ""}${entry.isOut ? " is-out" : ""}`}
            >
              <span className="live-board-pos">{index + 1}</span>
              <span className="live-board-code" style={{ color: entry.teamColor }}>
                {entry.acronym}
              </span>
              <span className="live-board-lap">L{entry.lap}</span>
              {entry.isOut ? <span className="live-board-out">OUT</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
