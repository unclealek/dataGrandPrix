/**
 * UserHUD.tsx
 * ───────────
 * Top-left HUD showing the user's live car state:
 * position, speed, score, fuel, and the latest hud_message from scoring.
 */

import type { UserCarState } from "../utils/racePositionEngine";
import styles from "./UserHUD.module.css";

interface Props {
  userCar: UserCarState;
  totalLaps: number;
  leadLap: number;
}

export function UserHUD({ userCar, totalLaps, leadLap }: Props) {
  const posColor =
    userCar.position <= 3 ? "#ffd700"
    : userCar.position <= 10 ? "#00e5ff"
    : "#ffffff";

  const fuelPct = Math.min(100, Math.max(0, userCar.fuel));
  const fuelColor = fuelPct > 40 ? "#00cc44" : fuelPct > 20 ? "#ffaa00" : "#ff2200";

  const hasCue = userCar.visualCue !== "NONE" && userCar.cueTimeRemaining > 0;

  return (
    <div className={styles.hud}>
      {/* Lap */}
      <div className={styles.lapRow}>
        <span className={styles.lapLabel}>Lap</span>
        <span className={styles.lapValue}>{leadLap} / {totalLaps}</span>
      </div>

      {/* Position */}
      <div className={styles.posRow}>
        <span className={styles.posLabel}>P</span>
        <span className={styles.posValue} style={{ color: posColor }}>
          {userCar.position}
        </span>
      </div>

      {/* Score */}
      <div className={styles.scoreRow}>
        <span className={styles.scoreLabel}>Data Quality</span>
        <span className={styles.scoreValue}>{userCar.qualityScore.toFixed(1)}%</span>
      </div>

      {/* Speed bar */}
      <div className={styles.statRow}>
        <span className={styles.statLabel}>Speed</span>
        <div className={styles.barTrack}>
          <div
            className={styles.barFill}
            style={{
              width: `${Math.min(100, (userCar.speed / 320) * 100)}%`,
              background: "#00e5ff",
            }}
          />
        </div>
        <span className={styles.statVal}>{Math.round(userCar.speed)}</span>
      </div>

      {/* Fuel bar */}
      <div className={styles.statRow}>
        <span className={styles.statLabel}>Fuel</span>
        <div className={styles.barTrack}>
          <div
            className={styles.barFill}
            style={{ width: `${fuelPct}%`, background: fuelColor }}
          />
        </div>
        <span className={styles.statVal}>{Math.round(fuelPct)}</span>
      </div>

      {/* HUD message */}
      {hasCue && (
        <div
          className={styles.message}
          style={{
            opacity: Math.min(1, userCar.cueTimeRemaining / 500),
            borderColor: userCar.isPenalty ? "#ff2200" : "#00e5ff",
            color: userCar.isPenalty ? "#ff6644" : "#00e5ff",
          }}
        >
          {userCar.hudMessage}
        </div>
      )}
    </div>
  );
}
