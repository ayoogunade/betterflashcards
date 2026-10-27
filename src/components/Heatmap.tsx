import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { db } from '../lib/db'
import { countByDay, dayKey, heatmapWeeks, streak } from '../lib/stats'

const WEEKS = 26

/** Reviews per day from every study mode, for one deck or all of them. */
export function useActivity(deckId?: string) {
  return useLiveQuery(async () => {
    const since = new Date(Date.now() - (WEEKS * 7 + 7) * 86_400_000).toISOString()
    const logs = deckId
      ? (await db.reviewLogs.where('deck_id').equals(deckId).toArray()).filter((l) => l.reviewed_at > since)
      : await db.reviewLogs.where('reviewed_at').above(since).toArray()
    return countByDay(logs.map((l) => l.reviewed_at))
  }, [deckId])
}

/** Review heatmap, newest week on the right. Scrolls to today on narrow screens. */
export function Heatmap({ byDay }: { byDay: Map<string, number> }) {
  const weeks = heatmapWeeks(byDay, WEEKS)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])
  const total = [...byDay.values()].reduce((a, b) => a + b, 0)
  return (
    <div>
      <div className="heatmap" ref={scroller} role="img" aria-label={`${total} reviews in the last ${WEEKS} weeks`}>
        {weeks.map((col, i) => (
          <div key={i} className="heat-col">
            {col.map((c) => (
              <div key={c.key} className={`heat l${c.level} ${c.future ? 'future' : ''}`} title={`${c.key}: ${c.count} review${c.count === 1 ? '' : 's'}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="row small muted" style={{ marginTop: 8, gap: 14 }}>
        <span>
          <b style={{ color: 'var(--ink)' }}>{byDay.get(dayKey(Date.now())) ?? 0}</b> today
        </span>
        <span>
          <b style={{ color: 'var(--ink)' }}>{streak(byDay)}</b> day streak
        </span>
        <span>
          <b style={{ color: 'var(--ink)' }}>{total}</b> in {WEEKS} weeks
        </span>
      </div>
    </div>
  )
}
