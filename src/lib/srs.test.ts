import { describe, expect, it } from 'vitest'
import { capForExam, dueCounts, formatInterval, newLeftToday, nextDue, preview, schedule, type QueueItem } from './srs'
import { DEFAULT_DECK_SETTINGS } from './types'

const S = DEFAULT_DECK_SETTINGS
const FIXED = { ...S, srsMode: 'fixed' as const }
const T0 = new Date('2026-10-27T12:00:00Z')
const MIN = 60_000
const DAY = 86_400_000

describe('FSRS scheduling', () => {
  it('previews grow from Again to Easy on a new card', () => {
    const p = preview(null, T0, S)
    expect(p[1]).toBeLessThan(p[3])
    expect(p[3]).toBeLessThanOrEqual(p[4])
    expect(p[4]).toBeGreaterThanOrEqual(DAY)
  })
  it('Good on a review card pushes the next review further out each time', () => {
    let srs = schedule(null, 4, T0, S)
    const first = Date.parse(srs.due) - T0.getTime()
    const later = new Date(Date.parse(srs.due))
    srs = schedule(srs, 3, later, S)
    expect(Date.parse(srs.due) - later.getTime()).toBeGreaterThan(first)
  })
  it('Again on a review card counts a lapse', () => {
    const r = schedule(null, 4, T0, S)
    const a = schedule(r, 1, new Date(Date.parse(r.due)), S)
    expect(a.lapses).toBe(1)
    expect(Date.parse(a.due) - Date.parse(r.due)).toBeLessThan(DAY)
  })
  it('keeps the first review time for the daily new-card cap', () => {
    const a = schedule(null, 3, T0, S)
    const b = schedule(a, 3, new Date(T0.getTime() + DAY), S)
    expect(b.first_at).toBe(T0.toISOString())
  })
})

describe('fixed intervals', () => {
  it('uses 1m / 15m / 1d / 4d and never grows', () => {
    const p = preview(null, T0, FIXED)
    expect([p[1], p[2], p[3], p[4]]).toEqual([MIN, 15 * MIN, DAY, 4 * DAY])
    const again = preview(schedule(null, 4, T0, FIXED), T0, FIXED)
    expect(again[3]).toBe(DAY)
  })
})

describe('session queue', () => {
  const now = T0.getTime()
  const at = (ms: number, state = 2) => ({ ...schedule(null, 3, T0, S), due: new Date(now + ms).toISOString(), state })
  it('learning due first, then overdue reviews, then new by deck order', () => {
    const items: QueueItem[] = [
      { key: 'new2', order: 2 },
      { key: 'new1', order: 1 },
      { key: 'rev', order: 0, srs: at(-DAY) },
      { key: 'learn', order: 3, srs: at(-MIN, 1) },
      { key: 'future', order: 4, srs: at(DAY) },
    ]
    expect(nextDue(items, now, 5)).toBe('learn')
    expect(nextDue(items.filter((i) => i.key !== 'learn'), now, 5)).toBe('rev')
    expect(nextDue(items.filter((i) => !['learn', 'rev'].includes(i.key)), now, 5)).toBe('new1')
    expect(nextDue(items.filter((i) => !['learn', 'rev'].includes(i.key)), now, 0)).toBeUndefined()
  })
  it('shows a learning card early instead of ending, but not the one just answered if another is waiting', () => {
    const items: QueueItem[] = [
      { key: 'a', order: 0, srs: at(MIN, 1) },
      { key: 'b', order: 1, srs: at(3 * MIN, 1) },
    ]
    expect(nextDue(items, now, 0, 'a')).toBe('b')
    expect(nextDue([items[0]], now, 0, 'a')).toBe('a')
    expect(nextDue([{ key: 'c', order: 0, srs: at(DAY, 1) }], now, 0)).toBeUndefined()
  })
  it('daily new-card cap counts cards first reviewed today', () => {
    const today = { srs: schedule(null, 3, new Date(), S) }
    expect(newLeftToday([today, today, { srs: null }], 10, Date.now())).toBe(8)
    expect(dueCounts([today, { srs: null }], 10, Date.now()).newToday).toBe(1)
  })
})

describe('formatInterval', () => {
  it('formats minutes to years', () => {
    expect([formatInterval(30_000), formatInterval(10 * MIN), formatInterval(3 * 3600_000), formatInterval(4 * DAY), formatInterval(90 * DAY)]).toEqual([
      '<1m',
      '10m',
      '3h',
      '4d',
      '3mo',
    ])
  })
})

describe('exam date', () => {
  const now = new Date('2026-11-01T10:00')
  const base = { srsMode: 'fixed' as const, retention: 0.9, fixedMinutes: [1, 15, 1440, 60 * 24 * 30] }

  it('caps intervals at the day before the exam', () => {
    const s = schedule(null, 4, now, { ...base, examDate: '2026-11-10' })
    expect(s.due).toBe(new Date('2026-11-09T00:00').toISOString())
  })

  it('leaves short intervals and past exams alone', () => {
    expect(schedule(null, 1, now, { ...base, examDate: '2026-11-10' }).due).toBe(new Date(now.getTime() + 60_000).toISOString())
    const after = schedule(null, 4, now, { ...base, examDate: '2026-10-01' })
    expect(after.due).toBe(new Date(now.getTime() + 30 * 86_400_000).toISOString())
  })

  it('ignores a missing date', () => {
    expect(capForExam(5, 1, null)).toBe(5)
  })
})
