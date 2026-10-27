import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef } from 'react'
import { alive, db, deckCards } from './db'
import type { Card, CardState, Deck } from './types'

export interface DeckData {
  deck: Deck
  cards: Card[]
  states: CardState[]
}

/** Live deck + its cards + study states. undefined while loading, null if missing. */
export function useDeck(deckId: string | undefined): DeckData | null | undefined {
  return useLiveQuery(async () => {
    if (!deckId) return null
    const deck = await db.decks.get(deckId)
    if (!deck) return null
    const cards = await deckCards(deckId)
    const ids = new Set(cards.map((c) => c.id))
    const states = (await db.cardStates.where('deck_id').equals(deckId).toArray()).filter((s) => ids.has(s.card_id))
    return { deck, cards, states }
  }, [deckId])
}

export function useDecks() {
  return useLiveQuery(async () => {
    const decks = await db.decks.toArray()
    const states = await db.cardStates.toArray()
    const cards = (await db.cards.toArray()).filter(alive)
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
