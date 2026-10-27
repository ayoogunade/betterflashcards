// Review activity: per-day counts for the heatmap, streak, and totals. Pure functions.

/** Local calendar day as YYYY-MM-DD, so a 11pm review counts for that evening, not tomorrow in UTC. */
export function dayKey(t: number | string | Date): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function countByDay(times: string[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of times) {
    const k = dayKey(t)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

/** Days in a row with at least one review, ending today (or yesterday, so the streak survives until you study today). */
export function streak(byDay: Map<string, number>, now = new Date()): number {
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!byDay.get(dayKey(d))) d = addDays(d, -1)
  let n = 0
  while (byDay.get(dayKey(d))) {
    n++
    d = addDays(d, -1)
  }
  return n
}

export interface HeatCell {
  key: string
  count: number
  /** 0 = none, 1 to 4 = quartiles of the busiest day. */
  level: number
  future: boolean
}

/** `weeks` columns of 7 days (Sunday on top), ending with the current week. */
export function heatmapWeeks(byDay: Map<string, number>, weeks: number, now = new Date()): HeatCell[][] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const start = addDays(today, -today.getDay() - (weeks - 1) * 7)
  const max = Math.max(1, ...byDay.values())
  const cols: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, w * 7 + i)
      const key = dayKey(d)
      const count = byDay.get(key) ?? 0
      col.push({ key, count, level: count ? Math.min(4, Math.ceil((count / max) * 4)) : 0, future: d > today })
    }
    cols.push(col)
  }
  return cols
}
