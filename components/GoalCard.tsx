'use client'

interface GoalCardProps {
  title:          string
  current:        number
  target:         number
  label:          string
  sublabel?:      string
  bgImage?:       string
  bgPosition?:    string
  bgSize?:        string
  unit?:          string
  progressIcon?:  string
}

const MONTHLY_GRADIENT =
  'linear-gradient(155deg, #0D1654 0%, #1565C0 45%, #E88B0C 100%)'

export default function GoalCard({
  title,
  current,
  target,
  label,
  sublabel,
  bgImage,
  bgPosition = 'center center',
  bgSize = 'cover',
  unit = '',
  progressIcon,
}: GoalCardProps) {
  const pct     = Math.min(current / target, 1)
  const display = unit ? `${current.toFixed(1)} ${unit}` : String(current)
  const iconPct = Math.max(Math.min(pct * 100, 95), 4)

  const bgStyle = bgImage
    ? {
        backgroundImage: `url(${bgImage})`,
        backgroundPosition: bgPosition,
        backgroundSize: bgSize,
        backgroundRepeat: 'no-repeat',
        backgroundColor: '#0D1654',
      }
    : { background: MONTHLY_GRADIENT }

  return (
    <div className="goal-card" style={bgStyle}>
      <div className="goal-card-overlay" />

      {/* Title badge */}
      <div className="goal-title-badge">
        <span>{title}</span>
      </div>

      {/* Sub-label (e.g. graduation pts) */}
      {sublabel && (
        <div className="goal-sublabel">{sublabel}</div>
      )}

      {/* Big number */}
      <div className="goal-number">{display}</div>

      {/* Arrow icon */}
      <div className="goal-arrow">↗</div>

      {/* Progress bar with icon marker */}
      <div className="goal-bar-wrapper">
        {progressIcon && (
          <div className="goal-progress-icon" style={{ left: `${iconPct}%` }}>
            {progressIcon}
          </div>
        )}
        <div className="goal-bar-track">
          <div className="goal-bar-fill" style={{ width: `${pct * 100}%` }} />
        </div>
      </div>

      {/* Bottom label */}
      <div className="goal-bottom">
        <span className="goal-bottom-label">TOTAL SALES:</span>
        <span className="goal-bottom-value">{label}</span>
      </div>
    </div>
  )
}
