// Manual JSON backup: every synced table in one file. Restoring merges with the same
// newest-wins rule as sync, so importing an old backup never overwrites newer work.

import { SYNC_KINDS, addCard, createDeck, db, deckCards, updateDeck, type SyncKind } from './db'
import { apply, stampOf } from './sync'
import type { Card, Deck } from './types'

export interface Backup {
  app: 'betterflashcards'
  version: 1
  exported_at: string
  tables: Record<SyncKind, Record<string, unknown>[]>
}

const ID: Record<SyncKind, string> = { folders: 'id', decks: 'id', cards: 'id', cardStates: 'key', reviewLogs: 'id' }

export async function exportAll(): Promise<Backup> {
  const tables = {} as Backup['tables']
  for (const kind of SYNC_KINDS) tables[kind] = await db.table(kind).toArray()
  return { app: 'betterflashcards', version: 1, exported_at: new Date().toISOString(), tables }
}

/** Save text as a file (a share sheet on iOS, a download on the Mac). */
export function downloadFile(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

export async function downloadBackup() {
  downloadFile(`betterflashcards-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll()), 'application/json')
}

/** One deck to hand to someone else: its cards and options, without stars, suspensions or study history. */
export interface SharedDeck {
  app: 'betterflashcards'
  kind: 'deck'
  version: 1
  deck: Pick<Deck, 'title' | 'description' | 'tags' | 'settings'>
  cards: Pick<Card, 'type' | 'front' | 'back' | 'hint'>[]
}

export async function exportDeck(deck: Deck): Promise<SharedDeck> {
  const cards = (await deckCards(deck.id)).map(({ type, front, back, hint }) => ({ type, front, back, hint }))
  const { title, description, tags, settings } = deck
  return { app: 'betterflashcards', kind: 'deck', version: 1, deck: { title, description, tags, settings: { ...settings, examDate: null } }, cards }
}

export async function downloadDeck(deck: Deck) {
  const name = (deck.title || 'deck').replace(/[^\w\- ]+/g, '').trim() || 'deck'
  downloadFile(`${name}.bfdeck.json`, JSON.stringify(await exportDeck(deck)), 'application/json')
}

/** A shared deck always arrives as a new deck with fresh ids, so importing twice never clobbers anything. */
export async function importDeck(data: SharedDeck): Promise<Deck> {
  const deck = await createDeck(data.deck.title || 'Shared deck')
  await updateDeck(deck.id, {
    description: data.deck.description ?? '',
    tags: data.deck.tags ?? [],
    settings: { ...deck.settings, ...data.deck.settings },
  })
  let order = 0
  for (const c of data.cards ?? []) await addCard(deck.id, { type: c.type, front: c.front ?? '', back: c.back ?? '', hint: c.hint }, order++)
  return deck
}

/** Import either file this app writes: a full backup or one shared deck. */
export async function importFile(text: string): Promise<string> {
  const data = JSON.parse(text) as Partial<SharedDeck>
  if (data.app === 'betterflashcards' && data.kind === 'deck' && data.deck) {
    const deck = await importDeck(data as SharedDeck)
    const n = data.cards?.length ?? 0
    return `Added "${deck.title}" (${n} ${n === 1 ? 'card' : 'cards'})`
  }
  return `Imported ${await importBackup(text)} rows`
}

/** Returns how many rows were in the file. */
export async function importBackup(text: string): Promise<number> {
  const data = JSON.parse(text) as Partial<Backup>
  if (data.app !== 'betterflashcards' || !data.tables) throw new Error('Not a BetterFlashcards file')
  let n = 0
  for (const kind of SYNC_KINDS) {
    const rows = data.tables[kind] ?? []
    await apply(rows.map((r) => ({ kind, id: String(r[ID[kind]]), data: r, updated_at: stampOf(kind, r), purged: false, server_at: '' })))
    n += rows.length
  }
  // Push everything on the next sync, so restored rows reach the server too (it ignores ones it already has).
  await db.meta.delete('pushedAt')
  return n
}
