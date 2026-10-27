import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { alive, db, deckCards, decksInGroup, isBlankCard, isGroupKey } from './db'
import { usePrefs } from './prefs'
import { DEFAULT_DECK_SETTINGS, type Card, type CardState, type Deck } from './types'

export interface DeckData {
  deck: Deck
  cards: Card[]
  states: CardState[]
}

/**
 * Live deck + its cards + study states (blank cards have none). undefined while loading, null if missing.
 * A group key (`all`, `folder:<id>`) returns every deck in it under a stand-in deck, so study screens work unchanged.
 */
export function useDeck(deckId: string | undefined): DeckData | null | undefined {
  const { deckDefaults, groupSettings } = usePrefs()
  return useLiveQuery(async () => {
    if (!deckId) return null
    let deck: Deck | undefined
    if (isGroupKey(deckId)) {
      const folder = deckId === 'all' ? null : await db.folders.get(deckId.slice('folder:'.length))
      if (deckId !== 'all' && !folder) return null
      const t = new Date(0).toISOString()
      deck = {
        id: deckId,
        title: folder ? folder.name : 'All decks',
        description: '',
        tags: [],
        pinned: false,
        settings: { ...DEFAULT_DECK_SETTINGS, ...deckDefaults, ...groupSettings[deckId] },
        created_at: t,
        updated_at: t,
      }
    } else deck = await db.decks.get(deckId)
    if (!deck) return null
    const deckIds = await decksInGroup(deckId)
    const cards = (await Promise.all(deckIds.map(deckCards))).flat()
    const ids = new Set(cards.filter((c) => !isBlankCard(c)).map((c) => c.id))
    const states = (await db.cardStates.where('deck_id').anyOf(deckIds).toArray()).filter((s) => ids.has(s.card_id))
    return { deck, cards, states }
  }, [deckId, deckDefaults, groupSettings])
}

/** Where a study screen's close button goes. */
export const backHref = (key: string | undefined) => (!key || isGroupKey(key) ? '/' : `/deck/${key}`)

export function useDecks() {
  return useLiveQuery(async () => {
    const decks = await db.decks.toArray()
    const states = await db.cardStates.toArray()
    const cards = (await db.cards.toArray()).filter((c) => alive(c) && !isBlankCard(c))
    const live = new Set(cards.map((c) => c.id))
    const byDeck = new Map<string, CardState[]>()
    for (const s of states) {
      if (!live.has(s.card_id)) continue
      if (!byDeck.has(s.deck_id)) byDeck.set(s.deck_id, [])
      byDeck.get(s.deck_id)!.push(s)
    }
    const counts = new Map<string, number>()
    for (const c of cards) counts.set(c.deck_id, (counts.get(c.deck_id) ?? 0) + 1)
    return { decks, byDeck, counts, cards }
  }, [])
}

export function useFolders() {
  return useLiveQuery(async () => (await db.folders.toArray()).filter(alive).sort((a, b) => a.name.localeCompare(b.name)), [])
}

/** Space, Enter, Up and Down all flip the study card back and forth. */
export const isFlipKey = (e: KeyboardEvent) => [' ', 'Enter', 'ArrowUp', 'ArrowDown'].includes(e.key)

/** Global keyboard shortcuts, ignored while typing in a field. */
export function useKeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable="true"], .sheet')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      ref.current(e)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
