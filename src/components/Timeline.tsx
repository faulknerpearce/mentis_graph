import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from './Icon'
import { formatDate } from '../lib/format'

interface TimelineProps {
  times: number[]
  until: number | null
  onChange: (until: number | null) => void
}

const BUCKETS = 64
const PLAY_DURATION_MS = 16000
/** Rebuilding the graph every frame makes playback stutter; ~8 steps a second glides. */
const PLAY_STEP_MS = 125

export function Timeline({ times, until, onChange }: TimelineProps) {
  const [playing, setPlaying] = useState(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const { min, max, buckets, peak } = useMemo(() => {
    if (times.length === 0) return { min: 0, max: 0, buckets: [] as number[], peak: 1 }
    let lo = Infinity
    let hi = -Infinity
    for (const t of times) {
      lo = Math.min(lo, t)
      hi = Math.max(hi, t)
    }
    const span = Math.max(hi - lo, 1)
    const counts = Array.from({ length: BUCKETS }, () => 0)
    for (const t of times) {
      counts[Math.min(BUCKETS - 1, Math.floor(((t - lo) / span) * BUCKETS))] += 1
    }
    return { min: lo, max: hi, buckets: counts, peak: Math.max(...counts, 1) }
  }, [times])

  const span = Math.max(max - min, 1)
  const current = until ?? max
  const progress = (current - min) / span
  const progressRef = useRef(progress)
  progressRef.current = progress

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const startProgress = progressRef.current >= 0.999 ? 0 : progressRef.current
    const startedAt = performance.now() - startProgress * PLAY_DURATION_MS
    let lastStep = -Infinity
    const tick = (now: number) => {
      const p = Math.min(1, (now - startedAt) / PLAY_DURATION_MS)
      if (p >= 1 || now - lastStep >= PLAY_STEP_MS) {
        lastStep = now
        onChangeRef.current(p >= 1 ? null : min + p * span)
      }
      if (p >= 1) {
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, min, span])

  if (times.length === 0) return null

  return (
    <div className="timeline glass">
      <button
        type="button"
        className="icon-btn play"
        onClick={() => setPlaying((p) => !p)}
        aria-label={playing ? 'Pause replay' : 'Replay how memory grew'}
        title={playing ? 'Pause' : 'Replay how memory grew'}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <div className="timeline-track">
        <div className="histogram" aria-hidden="true">
          {buckets.map((count, i) => (
            <span
              key={i}
              className={(i + 0.5) / BUCKETS <= progress ? 'on' : undefined}
              style={{ height: `${Math.max(4, (Math.sqrt(count) / Math.sqrt(peak)) * 100)}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          aria-label="Show memories recorded up to"
          onChange={(e) => {
            setPlaying(false)
            const value = Number(e.target.value) / 1000
            onChange(value >= 1 ? null : min + value * span)
          }}
        />
        <div className="timeline-scale">
          <span>{formatDate(min)}</span>
          <span className="timeline-current">{until == null ? 'Now' : formatDate(current)}</span>
          <span>{formatDate(max)}</span>
        </div>
      </div>
    </div>
  )
}
