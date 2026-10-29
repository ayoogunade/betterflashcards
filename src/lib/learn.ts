// Learn mode engine: rounds of cards, a retry queue for misses, and a status ladder.
// Pure functions only, so the rules are unit-tested without the UI or database.

import type { Status } from './types'

export interface LadderState {
  status: Status
  streak: number
}

/**
 * Status ladder. A miss always drops to Still learning. A correct answer climbs one step per
 * round: New -> Almost done -> Mastered (with correctToMaster = 2). Getting a card right in the
 * same round it was missed does not climb.
 */
export function applyRating(
  state: LadderState,
  correct: boolean,
  missedThisRound: boolean,
  correctToMaster: number,
): LadderState {
  if (!correct) return { status: 'learning', streak: 0 }
  if (missedThisRound) return { status: 'learning', streak: 0 }
  const streak = state.streak + 1
  return { status: streak >= Math.max(1, correctToMaster) ? 'mastered' : 'almost', streak }
}

export interface PickItem {
  key: string
  status: Status
  order: number
}

export interface PickOptions {
  size: number
  shuffle: boolean
  reviewMastered: boolean
  rng?: () => number
}

export function shuffled<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Choose the cards for the next round: Still learning first, then Almost done, then New.
 * Mastered cards only come back when nothing else is left or reviewMastered is on.
 */
export function pickRound(items: PickItem[], opts: PickOptions): string[] {
  const order = (list: PickItem[]) =>
    opts.shuffle ? shuffled(list, opts.rng) : list.slice().sort((a, b) => a.order - b.order)
  const by = (s: Status) => order(items.filter((i) => i.status === s))
  let pool = [...by('learning'), ...by('almost'), ...by('new')]
  if (opts.reviewMastered || pool.length === 0) pool = [...pool, ...by('mastered')]
  return pool.slice(0, Math.max(1, opts.size)).map((i) => i.key)
}

export interface RoundState {
  /** Keys in the order they will be shown; misses are re-inserted further down. */
  queue: string[]
  pos: number
  /** First answer for each key this round (true = got it). */
  firstTry: Record<string, boolean>
  missed: string[]
}

export function startRound(keys: string[]): RoundState {
  return { queue: keys.slice(), pos: 0, firstTry: {}, missed: [] }
}

export function currentKey(round: RoundState): string | undefined {
  return round.queue[round.pos]
}

export function isRoundDone(round: RoundState): boolean {
  return round.pos >= round.queue.length
}

/** How many cards later a missed card comes back. */
export const RETRY_GAP = 2

/** Record an answer for the current card and advance. A miss re-queues the card RETRY_GAP cards later. */
export function answerRound(round: RoundState, correct: boolean): RoundState {
  const key = round.queue[round.pos]
  if (key === undefined) return round
  const queue = round.queue.slice()
  const firstTry = key in round.firstTry ? round.firstTry : { ...round.firstTry, [key]: correct }
  const missed = !correct && !round.missed.includes(key) ? [...round.missed, key] : round.missed
  if (!correct) queue.splice(Math.min(queue.length, round.pos + 1 + RETRY_GAP), 0, key)
  return { queue, pos: round.pos + 1, firstTry, missed }
}

/** Take `gone` keys out of a queue, keeping the position on the same upcoming card. */
export function dropKeys(queue: string[], pos: number, gone: Set<string>): { queue: string[]; pos: number } {
  return { queue: queue.filter((k) => !gone.has(k)), pos: pos - queue.slice(0, pos).filter((k) => gone.has(k)).length }
}

/** A round without the `gone` keys (deleted mid-round): they leave the queue, misses and score. */
export function dropFromRound(round: RoundState, gone: Set<string>): RoundState {
  const firstTry = Object.fromEntries(Object.entries(round.firstTry).filter(([k]) => !gone.has(k)))
  return { ...dropKeys(round.queue, round.pos, gone), firstTry, missed: round.missed.filter((k) => !gone.has(k)) }
}

export function roundScore(round: RoundState): { correct: number; total: number } {
  const vals = Object.values(round.firstTry)
  return { correct: vals.filter(Boolean).length, total: vals.length }
}

const WEIGHT: Record<Status, number> = { new: 0, learning: 1 / 3, almost: 2 / 3, mastered: 1 }

/** Set mastery as a whole percentage. */
export function masteryPercent(statuses: Status[]): number {
  if (!statuses.length) return 0
  const sum = statuses.reduce((acc, s) => acc + WEIGHT[s], 0)
  return Math.round((sum / statuses.length) * 100)
}

export function statusCounts(statuses: Status[]): Record<Status, number> {
  const c: Record<Status, number> = { new: 0, learning: 0, almost: 0, mastered: 0 }
  for (const s of statuses) c[s]++
  return c
}

/** Cards missed this many times (Learn misses plus spaced-review lapses) are leeches: worth rewriting. */
export const LEECH_AT = 6
export const isLeech = (s: { lapses: number; srs?: { lapses: number } | null }) => s.lapses + (s.srs?.lapses ?? 0) >= LEECH_AT

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  learning: 'Still learning',
  almost: 'Almost done',
  mastered: 'Mastered',
}
