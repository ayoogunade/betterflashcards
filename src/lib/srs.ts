// Spaced repetition: FSRS via ts-fsrs, or one fixed interval per button.
// Pure functions only, so scheduling is unit-tested without the UI or database.

import { State, createEmptyCard, fsrs, generatorParameters, type Card as FsrsCard, type Grade } from 'ts-fsrs'
import type { CardState, DeckSettings, SrsData } from './types'

export type { Grade }
export const GRADES: Grade[] = [1, 2, 3, 4]
export const GRADE_LABEL: Record<Grade, string> = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' }

const MIN = 60_000
const DAY = 86_400_000

/** Learning cards due within this window are shown early instead of ending the session. */
export const LEARN_AHEAD_MS = 5 * MIN

type SrsSettings = Pick<DeckSettings, 'srsMode' | 'retention' | 'fixedMinutes' | 'examDate'>

function toFsrs(s: SrsData | null | undefined, now: Date): FsrsCard {
  if (!s) return createEmptyCard(now)
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  }
}

function fromFsrs(c: FsrsCard, prev: SrsData | null | undefined, now: Date): SrsData {
  return {
    due: c.due.toISOString(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: now.toISOString(),
    first_at: prev?.first_at ?? now.toISOString(),
  }
}

/** Fixed mode: each button has one interval that never grows. */
function scheduleFixed(prev: SrsData | null | undefined, grade: Grade, now: Date, minutes: number[]): SrsData {
  const ms = (minutes[grade - 1] ?? 1) * MIN
  const wasReview = prev?.state === State.Review
  return {
    due: new Date(now.getTime() + ms).toISOString(),
    stability: prev?.stability ?? 0,
    difficulty: prev?.difficulty ?? 0,
    scheduled_days: Math.floor(ms / DAY),
    learning_steps: 0,
    reps: (prev?.reps ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (grade === 1 && wasReview ? 1 : 0),
    state: ms >= DAY ? State.Review : wasReview ? State.Relearning : State.Learning,
    last_review: now.toISOString(),
    first_at: prev?.first_at ?? now.toISOString(),
  }
}

const schedulers = new Map<number, ReturnType<typeof fsrs>>()
function scheduler(retention: number) {
  let f = schedulers.get(retention)
  if (!f) {
    f = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: false }))
    schedulers.set(retention, f)
  }
  return f
}

export function schedule(prev: SrsData | null | undefined, grade: Grade, now: Date, s: SrsSettings): SrsData {
  const next =
    s.srsMode === 'fixed' ? scheduleFixed(prev, grade, now, s.fixedMinutes) : fromFsrs(scheduler(s.retention).next(toFsrs(prev, now), now, grade).card, prev, now)
  const due = capForExam(Date.parse(next.due), now.getTime(), s.examDate)
  if (due === Date.parse(next.due)) return next
  return { ...next, due: new Date(due).toISOString(), scheduled_days: Math.floor((due - now.getTime()) / DAY) }
}

/** Start of the day before the exam (local time), or null without a usable date. */
export function examCutoff(examDate: string | null | undefined): number | null {
  if (!examDate) return null
  const t = Date.parse(`${examDate}T00:00`)
  return Number.isNaN(t) ? null : t - DAY
}

/** With an exam date, nothing is due after the day before it, so every card comes up again in time. */
export function capForExam(due: number, now: number, examDate: string | null | undefined): number {
  const cut = examCutoff(examDate)
  return cut !== null && now < cut && due > cut ? cut : due
}

/** Time until due for each button, shown above the buttons before choosing. */
export function preview(prev: SrsData | null | undefined, now: Date, s: SrsSettings): Record<Grade, number> {
  const out = {} as Record<Grade, number>
  for (const g of GRADES) out[g] = Date.parse(schedule(prev, g, now, s).due) - now.getTime()
  return out
}

export function formatInterval(ms: number): string {
  if (ms < MIN) return '<1m'
  const m = Math.round(ms / MIN)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(ms / DAY)
  if (d < 31) return `${d}d`
  if (d < 365) return `${Math.round(d / 30)}mo`
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`
}

export const isNew = (st: Pick<CardState, 'srs'>) => !st.srs
export const isDue = (st: Pick<CardState, 'srs'>, now: number) => !!st.srs && Date.parse(st.srs.due) <= now

export function startOfDay(now: number): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** New cards still allowed today: the daily cap minus cards first reviewed since midnight. */
export function newLeftToday(states: Pick<CardState, 'srs'>[], newPerDay: number, now: number): number {
  const since = startOfDay(now)
  const started = states.filter((s) => s.srs && Date.parse(s.srs.first_at) >= since).length
  return Math.max(0, newPerDay - started)
}

export interface QueueItem {
  key: string
  srs?: SrsData | null
  order: number
}

/**
 * Next card for a spaced-repetition session: learning cards that are due, then due reviews
 * (most overdue first), then new cards (deck order) while the daily cap allows, then learning
 * cards due within LEARN_AHEAD_MS. Returns undefined when the session is finished.
 */
export function nextDue(items: QueueItem[], now: number, newLeft: number, skip?: string): string | undefined {
  const due = (i: QueueItem) => (i.srs ? Date.parse(i.srs.due) : Infinity)
  const learning = (i: QueueItem) => !!i.srs && i.srs.state !== State.Review
  const pool = items.filter((i) => i.key !== skip)
  const byDue = (a: QueueItem, b: QueueItem) => due(a) - due(b)
  const first =
    pool.filter((i) => learning(i) && due(i) <= now).sort(byDue)[0] ??
    pool.filter((i) => !learning(i) && i.srs && due(i) <= now).sort(byDue)[0] ??
    (newLeft > 0 ? pool.filter((i) => !i.srs).sort((a, b) => a.order - b.order)[0] : undefined) ??
    pool.filter((i) => learning(i) && due(i) <= now + LEARN_AHEAD_MS).sort(byDue)[0]
  // A card that was just answered may be the only one left; show it again rather than end early.
  if (!first && skip) return nextDue(items, now, newLeft)
  return first?.key
}

/** Counts for the deck page and home: due now, due by end of today, due within 7 days, new available today. */
export function dueCounts(states: Pick<CardState, 'srs'>[], newPerDay: number, now: number) {
  const endToday = startOfDay(now) + DAY
  const week = endToday + 6 * DAY
  let dueNow = 0
  let today = 0
  let thisWeek = 0
  let fresh = 0
  for (const s of states) {
    if (!s.srs) {
      fresh++
      continue
    }
    const d = Date.parse(s.srs.due)
    if (d <= now) dueNow++
    if (d < endToday) today++
    if (d < week) thisWeek++
  }
  const newToday = Math.min(fresh, newLeftToday(states, newPerDay, now))
  return { dueNow, today, thisWeek, newToday }
}
