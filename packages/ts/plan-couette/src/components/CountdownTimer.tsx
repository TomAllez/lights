import { useState, useEffect } from 'react'

type CountdownTimerProps = {
  targetMilliseconds: number
  label: string
}

type TimeComponents = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function decomposeMilliseconds(totalMs: number): TimeComponents {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}

export function CountdownTimer({ targetMilliseconds, label }: CountdownTimerProps) {
  const [remainingMs, setRemainingMs] = useState(targetMilliseconds)

  useEffect(() => {
    setRemainingMs(targetMilliseconds)
    const interval = setInterval(() => {
      setRemainingMs(prev => Math.max(0, prev - 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [targetMilliseconds])

  const { days, hours, minutes, seconds } = decomposeMilliseconds(remainingMs)

  return (
    <div className="countdown-timer">
      <p className="countdown-label">{label}</p>
      <div className="countdown-units">
        {days > 0 && (
          <div className="countdown-unit">
            <span className="countdown-number">{days}</span>
            <span className="countdown-unit-label">j</span>
          </div>
        )}
        <div className="countdown-unit">
          <span className="countdown-number">{String(hours).padStart(2, '0')}</span>
          <span className="countdown-unit-label">h</span>
        </div>
        <div className="countdown-unit">
          <span className="countdown-number">{String(minutes).padStart(2, '0')}</span>
          <span className="countdown-unit-label">min</span>
        </div>
        <div className="countdown-unit">
          <span className="countdown-number">{String(seconds).padStart(2, '0')}</span>
          <span className="countdown-unit-label">sec</span>
        </div>
      </div>
    </div>
  )
}
