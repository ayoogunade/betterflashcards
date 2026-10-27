import Dexie, { type Table } from 'dexie'
import { clozeCount, stripCloze } from './cloze'
import { textToHtml, type ParsedCard } from './importParser'
import { getPrefs } from './prefs'
import {
  DEFAULT_DECK_SETTINGS,
  type Card,
  type CardState,
  type Deck,
  type Folder,
  type ReviewLog,
} from './types'

class FlashDB extends Dexie {
  folders!: Table<Folder, string>
  decks!: Table<Deck, string>
  cards!: Table<Card, string>
  cardStates!: Table<CardState, string>
  reviewLogs!: Table<ReviewLog, string>
  /** Hard-deleted rows not yet pushed, so sync can delete them on other devices. */
  tombstones!: Table<Tombstone, string>
  /** Sync cursors and other small device-local values. */
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('betterflashcards')
    this.version(1).stores({
      folders: 'id, updated_at',
      decks: 'id, folder_id, updated_at, last_studied_at',
      cards: 'id, deck_id, [deck_id+sort_order], updated_at',
      cardStates: 'key, card_id, deck_id, updated_at',
      reviewLogs: 'id, card_id, deck_id, reviewed_at',
    })
    this.version(2)
      .stores({ reviewLogs: 'id, card_id, deck_id, reviewed_at', tombstones: 'key', meta: 'key' })
      .upgrade((tx) =>
        tx
          .table('decks')
          .toCollection()
          .modify((d: Deck) => {
            d.settings = { ...DEFAULT_DECK_SETTINGS, ...d.settings }
          }),
      )
  }
}

export const db = new FlashDB()

export const SYNC_KINDS = ['folders', 'decks', 'cards', 'cardStates', 'reviewLogs'] as const
export type SyncKind = (typeof SYNC_KINDS)[number]

export interface Tombstone {
  key: string
  kind: SyncKind
  id: string
  at: string
}

/** Delete rows for good and leave tombstones so the deletion reaches other devices. */
export async function hardDelete(kind: SyncKind, ids: string[]) {
  if (!ids.length) return
  const at = now()
  await db.tombstones.bulkPut(ids.map((id) => ({ key: `${kind}:${id}`, kind, id, at })))
  await db.table(kind).bulkDelete(ids)
}

/** crypto.randomUUID only exists in secure contexts; a phone hitting the dev server over LAN is not one. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const now = () => new Date().toISOString()

export const alive = <T extends { deleted_at?: string | null }>(row: T) => !row.deleted_at

export function htmlToText(html: string): string {
  return stripCloze(html.replace(/<br\s*\/?>/gi, ' ').replace(/<\/p>/gi, ' ').replace(/<[^>]+>/g, ''))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A card with no text and no image on either side (e.g. an inserted card left empty). Never studied. */
export function isBlankCard(card: Pick<Card, 'front' | 'back'>): boolean {
  const empty = (html: string) => !htmlToText(html) && !/<img/i.test(html)
  return empty(card.front) && empty(card.back)
}

/** Study screens can run on one deck, a folder (`folder:<id>`), or every deck (`all`). */
export const isGroupKey = (key?: string) => key === 'all' || !!key?.startsWith('folder:')

/** Live deck ids behind a study key. */
export async function decksInGroup(key: string): Promise<string[]> {
  if (!isGroupKey(key)) return [key]
  const decks = (await db.decks.toArray()).filter(alive)
  return (key === 'all' ? decks : decks.filter((d) => d.folder_id === key.slice('folder:'.length))).map((d) => d.id)
}

// ---- Decks ----

export async function createDeck(title = 'Untitled deck', folder_id: string | null = null): Promise<Deck> {
  const t = now()
  const deck: Deck = {
    id: uid(),
    title,
    description: '',
    tags: [],
    folder_id,
    pinned: false,
    settings: { ...DEFAULT_DECK_SETTINGS, ...getPrefs().deckDefaults },
    created_at: t,
    updated_at: t,
    last_studied_at: null,
    deleted_at: null,
  }
  await db.decks.add(deck)
  return deck
}

export async function updateDeck(id: string, patch: Partial<Deck>) {
  await db.decks.update(id, { ...patch, updated_at: now() })
}

export async function trashDeck(id: string) {
  await updateDeck(id, { deleted_at: now() })
}

export async function restoreDeck(id: string) {
  await updateDeck(id, { deleted_at: null })
}

/** Permanent delete (from Trash, or 30 days after trashing). */
export async function destroyDeck(id: string) {
  await db.transaction('rw', [db.decks, db.cards, db.cardStates, db.reviewLogs, db.tombstones], async () => {
    await hardDelete('cards', (await db.cards.where('deck_id').equals(id).primaryKeys()) as string[])
    await hardDelete('cardStates', (await db.cardStates.where('deck_id').equals(id).primaryKeys()) as string[])
    await hardDelete('reviewLogs', (await db.reviewLogs.where('deck_id').equals(id).primaryKeys()) as string[])
    await hardDelete('decks', [id])
  })
}

const TRASH_DAYS = 30

export async function purgeTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 86400_000
  const old = (await db.decks.toArray()).filter((d) => d.deleted_at && Date.parse(d.deleted_at) < cutoff)
  for (const d of old) await destroyDeck(d.id)
}

export async function deckCards(deckId: string): Promise<Card[]> {
  const cards = await db.cards.where('deck_id').equals(deckId).toArray()
  return cards.filter(alive).sort((a, b) => a.sort_order - b.sort_order)
}

/** Copy decks' cards into a new deck (duplicate = one source, combine = several). */
export async function copyIntoNewDeck(sourceIds: string[], title: string): Promise<Deck> {
  const deck = await createDeck(title)
  const sources = await db.decks.bulkGet(sourceIds)
  const first = sources.find(Boolean)
  if (first) {
    await updateDeck(deck.id, {
      settings: { ...first.settings },
      tags: [...new Set(sources.flatMap((s) => s?.tags ?? []))],
      folder_id: first.folder_id ?? null,
    })
  }
  let order = 0
  for (const id of sourceIds) {
    for (const c of await deckCards(id)) {
      await addCard(deck.id, { type: c.type, front: c.front, back: c.back, hint: c.hint, starred: c.starred }, order++)
    }
  }
  return deck
}

// ---- Cards ----

export async function addCard(
  deckId: string,
  data: Pick<Card, 'type' | 'front' | 'back'> & Partial<Pick<Card, 'hint' | 'starred'>>,
  sort_order?: number,
): Promise<Card> {
  if (sort_order === undefined) {
    const cards = await deckCards(deckId)
    sort_order = cards.length ? cards[cards.length - 1].sort_order + 1 : 0
  }
  const t = now()
  const card: Card = {
    id: uid(),
    deck_id: deckId,
    sort_order,
    type: data.type,
    front: data.front,
    back: data.back,
    hint: data.hint ?? null,
    starred: data.starred ?? false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
  }
  await db.cards.add(card)
  await syncStates(card)
  await touchDeck(deckId)
  return card
}

export async function updateCard(id: string, patch: Partial<Card>) {
  await db.cards.update(id, { ...patch, updated_at: now() })
  const card = await db.cards.get(id)
  if (card) {
    await syncStates(card)
    await touchDeck(card.deck_id)
  }
}

export async function deleteCard(id: string) {
  await updateCard(id, { deleted_at: now() })
}

export async function importCards(deckId: string, parsed: ParsedCard[], replace: boolean) {
  await db.transaction('rw', [db.cards, db.cardStates, db.decks, db.tombstones], async () => {
    if (replace) {
      const t = now()
      const old = await deckCards(deckId)
      await db.cards.bulkUpdate(old.map((c) => ({ key: c.id, changes: { deleted_at: t, updated_at: t } })))
      await hardDelete('cardStates', (await db.cardStates.where('deck_id').equals(deckId).primaryKeys()) as string[])
    }
    const existing = replace ? [] : await deckCards(deckId)
    let order = existing.length ? existing[existing.length - 1].sort_order + 1 : 0
    for (const p of parsed) {
      await addCard(deckId, { type: p.type, front: textToHtml(p.front), back: p.back ? textToHtml(p.back) : '' }, order++)
    }
  })
}

/** Add a blank card at `index` (0 = first), shifting the cards after it down. */
export async function insertCardAt(deckId: string, index: number): Promise<Card> {
  const ids = (await deckCards(deckId)).map((c) => c.id)
  const card = await addCard(deckId, { type: 'basic', front: '', back: '' })
  ids.splice(index, 0, card.id)
  await reorderCards(ids)
  return card
}

/** Move cards (with their study progress) to the end of another deck. */
export async function moveCards(ids: string[], toDeckId: string) {
  const t = now()
  const existing = await deckCards(toDeckId)
  let order = existing.length ? existing[existing.length - 1].sort_order + 1 : 0
  const from = new Set<string>()
  await db.transaction('rw', db.cards, db.cardStates, db.decks, async () => {
    for (const id of ids) {
      const card = await db.cards.get(id)
      if (!card) continue
      from.add(card.deck_id)
      await db.cards.update(id, { deck_id: toDeckId, sort_order: order++, updated_at: t })
      await db.cardStates.where('card_id').equals(id).modify({ deck_id: toDeckId, updated_at: t })
    }
    for (const d of [...from, toDeckId]) await touchDeck(d)
  })
}

/** Soft-delete cards left completely empty, e.g. when leaving the editor. */
export async function removeBlankCards(deckId: string) {
  const t = now()
  const blank = (await deckCards(deckId)).filter(isBlankCard)
  if (blank.length) await db.cards.bulkUpdate(blank.map((c) => ({ key: c.id, changes: { deleted_at: t, updated_at: t } })))
  return blank.length
}

/** Rewrite sort_order to match the given id order. */
export async function reorderCards(ids: string[]) {
  const t = now()
  await db.cards.bulkUpdate(ids.map((id, i) => ({ key: id, changes: { sort_order: i, updated_at: t } })))
}

async function touchDeck(deckId: string) {
  await db.decks.update(deckId, { updated_at: now() })
}

/** Keep one CardState per study item: 1 for basic cards, one per blank group for cloze cards. */
export async function syncStates(card: Card) {
  const want = card.deleted_at ? 0 : card.type === 'cloze' ? clozeCount(card.front) : 1
  const existing = await db.cardStates.where('card_id').equals(card.id).toArray()
  const t = now()
  await hardDelete('cardStates', existing.filter((s) => s.sub_index >= want).map((s) => s.key))
  for (let i = 0; i < want; i++) {
    const key = `${card.id}:${i}`
    if (!existing.some((s) => s.key === key)) {
      await db.cardStates.put({
        key,
        card_id: card.id,
        deck_id: card.deck_id,
        sub_index: i,
        status: 'new',
        streak: 0,
        know_pile: null,
        reps: 0,
        lapses: 0,
        updated_at: t,
      })
    }
  }
}

/** 'study' resets Learn statuses and Flashcards piles; 'schedule' resets spaced repetition. Accepts a group key too. */
export async function resetProgress(deckId: string, what: 'study' | 'schedule' = 'study') {
  const t = now()
  const states = await db.cardStates.where('deck_id').anyOf(await decksInGroup(deckId)).toArray()
  const patch = what === 'study' ? { status: 'new' as const, streak: 0, know_pile: null } : { srs: null }
  await db.cardStates.bulkPut(states.map((s) => ({ ...s, ...patch, updated_at: t })))
}

export async function logReview(entry: Omit<ReviewLog, 'id' | 'reviewed_at'>): Promise<string> {
  const id = uid()
  await db.reviewLogs.add({ ...entry, id, reviewed_at: now() })
  await db.decks.update(entry.deck_id, { last_studied_at: now() })
  return id
}

// ---- Folders ----

export async function createFolder(name: string): Promise<Folder> {
  const folder: Folder = { id: uid(), name, parent_id: null, sort_order: Date.now(), updated_at: now(), deleted_at: null }
  await db.folders.add(folder)
  return folder
}

export async function deleteFolder(id: string) {
  const decks = await db.decks.where('folder_id').equals(id).toArray()
  for (const d of decks) await updateDeck(d.id, { folder_id: null })
  await db.folders.update(id, { deleted_at: now(), updated_at: now() })
}

// ---- Persistence ----

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist()
  } catch {
    // Not supported; Phase 2 sync is the real backup.
  }
}
