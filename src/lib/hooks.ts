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

/** The states a study mode works through: suspended cards left out, and only starred ones if asked. */
export function studyStates(data: DeckData | null | undefined, starredOnly: boolean | undefined): CardState[] {
  if (!data) return []
  const ok = new Set(data.cards.filter((c) => !c.suspended && (!starredOnly || c.starred)).map((c) => c.id))
  return data.states.filter((s) => ok.has(s.card_id))
}

/**
 * Cards added from the Edit card sheet mid-study join the session: call the returned function with
 * their ids, and `onKeys` gets their study keys once the live data has them.
 */
export function useAddedCards(data: DeckData | null | undefined, onKeys: (keys: string[]) => void) {
  const pending = useRef<string[]>([])
  const latest = useRef({ data, onKeys })
  latest.current = { data, onKeys }
  const check = () => {
    const { data, onKeys } = latest.current
    if (!data || !pending.current.length) return
    const ids = new Set(pending.current)
    const states = data.states.filter((s) => ids.has(s.card_id))
    if (!states.length) return
    const found = new Set(states.map((s) => s.card_id))
    pending.current = pending.current.filter((id) => !found.has(id))
    onKeys(states.sort((a, b) => a.sub_index - b.sub_index).map((s) => s.key))
  }
  useEffect(check, [data]) // eslint-disable-line react-hooks/exhaustive-deps
  return (ids: string[]) => {
    pending.current.push(...ids)
    check()
  }
}

/** Where a study screen's close button goes. */
export const backHref = (key: string | undefined) => (!key || isGroupKey(key) ? '/' : `/deck/${key}`)

export function useDecks() {
  return useLiveQuery(async () => {
    const decks = await db.decks.toArray()
    const states = await db.cardStates.toArray()
    const cards = (await db.cards.toArray()).filter((c) => alive(c) && !isBlankCard(c))
    // Suspended cards still count as cards, but never come due.
    const live = new Set(cards.filter((c) => !c.suspended).map((c) => c.id))
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
