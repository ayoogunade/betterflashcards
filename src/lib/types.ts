// Row shapes mirror the Postgres rows so sync can push/pull them as-is.

export type ISODate = string

export interface SyncFields {
  updated_at: ISODate
  deleted_at?: ISODate | null
}

export interface Folder extends SyncFields {
  id: string
  name: string
  parent_id?: string | null
  sort_order: number
}

export type Direction = 'def-term' | 'term-def' | 'mixed'

export interface DeckSettings {
  roundSize: number
  direction: Direction
  starredOnly: boolean
  shuffle: boolean
  correctToMaster: number
  reviewMastered: boolean
  autoplayTts: boolean
  sortPiles: boolean
  // Spaced repetition
  srsMode: 'fsrs' | 'fixed'
  newPerDay: number
  /** FSRS desired retention, 0.7 to 0.99. */
  retention: number
  /** Fixed mode: minutes for Again, Hard, Good, Easy (default 1m, 15m, 1d, 4d). */
  fixedMinutes: number[]
}

export const DEFAULT_DECK_SETTINGS: DeckSettings = {
  roundSize: 7,
  direction: 'def-term',
  starredOnly: false,
  shuffle: false,
  correctToMaster: 2,
  reviewMastered: false,
  autoplayTts: false,
  sortPiles: true,
  srsMode: 'fsrs',
  newPerDay: 10,
  retention: 0.9,
  fixedMinutes: [1, 15, 1440, 5760],
}

export interface Deck extends SyncFields {
  id: string
  title: string
  description: string
  tags: string[]
  folder_id?: string | null
  pinned: boolean
  settings: DeckSettings
  created_at: ISODate
  last_studied_at?: ISODate | null
}

export type CardType = 'basic' | 'cloze'

export interface Card extends SyncFields {
  id: string
  deck_id: string
  sort_order: number
  type: CardType
  /** Term (basic) or the cloze text. Sanitised HTML from the editor. */
  front: string
  /** Definition (basic) or optional extra info (cloze). */
  back: string
  hint?: string | null
  starred: boolean
  created_at: ISODate
}

export type Status = 'new' | 'learning' | 'almost' | 'mastered'

export interface CardState {
  /** `${card_id}:${sub_index}` */
  key: string
  card_id: string
  deck_id: string
  sub_index: number
  status: Status
  /** Consecutive correct answers across rounds; drives the status ladder. */
  streak: number
  know_pile: 'know' | 'dont_know' | null
  /** Spaced repetition schedule; null until first reviewed in Spaced mode. Separate from Learn's ladder. */
  srs?: SrsData | null
  last_review?: ISODate | null
  reps: number
  lapses: number
  updated_at: ISODate
}

/** FSRS card fields (ts-fsrs), stored as plain JSON. */
export interface SrsData {
  due: ISODate
  stability: number
  difficulty: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  /** 0 New, 1 Learning, 2 Review, 3 Relearning */
  state: number
  last_review: ISODate | null
  /** First spaced review, for the new-cards-per-day cap. */
  first_at: ISODate
}

export type Rating = 'got' | 'missed' | 'know' | 'dont_know' | 'again' | 'hard' | 'good' | 'easy'

export interface ReviewLog {
  id: string
  card_id: string
  deck_id: string
  sub_index: number
  mode: 'flashcards' | 'learn' | 'spaced'
  rating: Rating
  duration_ms: number
  reviewed_at: ISODate
}
