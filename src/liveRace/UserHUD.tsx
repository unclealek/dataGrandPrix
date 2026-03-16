import type { UserCarState } from "./racePositionEngine";

interface Props {
  userCar: UserCarState;
  totalLaps: number;
  leadLap: number;
}

export function UserHUD({ userCar, totalLaps, leadLap }: Props) {
  const positionColor = userCar.position <= 3 ? "#ffd700" : userCar.position <= 10 ? "#00e5ff" : "#f2f4f7";
  const fuelPercent = Math.min(100, Math.max(0, userCar.fuel));
  const fuelColor = fuelPercent > 40 ? "#00cc44" : fuelPercent > 20 ? "#ffaa00" : "#ff3344";
  const showMessage = userCar.visualCue !== "NONE" && userCar.cueTimeRemaining > 0;

  return (
    <div className="user-hud">
      <div className="user-hud-row compact">
        <span className="user-hud-label">Lap</span>
        <span className="user-hud-value">
          {leadLap} / {totalLaps}
        </span>
      </div>

      <div className="user-hud-position">
        <span className="user-hud-position-label">P</span>
        <span className="user-hud-position-value" style={{ color: positionColor }}>
          {userCar.position}
        </span>
      </div>

      <div className="user-hud-row compact">
        <span className="user-hud-label">Data Quality</span>
        <span className="user-hud-value">{userCar.qualityScore.toFixed(1)}%</span>
      </div>

      <div className="user-hud-row">
        <span className="user-hud-label">Speed</span>
        <div className="user-hud-bar">
          <div className="user-hud-bar-fill cyan" style={{ width: `${Math.min(100, (userCar.speed / 320) * 100)}%` }} />
        </div>
        <span className="user-hud-value">{Math.round(userCar.speed)}</span>
      </div>

      <div className="user-hud-row">
        <span className="user-hud-label">Fuel</span>
        <div className="user-hud-bar">
          <div className="user-hud-bar-fill" style={{ width: `${fuelPercent}%`, background: fuelColor }} />
        </div>
        <span className="user-hud-value">{Math.round(fuelPercent)}</span>
      </div>

      {showMessage ? (
        <div
          className={`user-hud-message${userCar.isPenalty ? " penalty" : ""}`}
          style={{ opacity: Math.min(1, userCar.cueTimeRemaining / 500) }}
        >
          {userCar.hudMessage}
        </div>
      ) : null}
    </div>
  );
}
