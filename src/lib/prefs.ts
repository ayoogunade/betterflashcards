// Device-local preferences: theme, card text size, and study options for new decks.
// Kept in localStorage on purpose: an iPhone and a Mac can want different text sizes.

import { useSyncExternalStore } from 'react'
import { DEFAULT_DECK_SETTINGS, type DeckSettings } from './types'

export type Theme = 'system' | 'light' | 'dark'

export interface Prefs {
  theme: Theme
  cardScale: number
  deckDefaults: DeckSettings
  /** Study options for folder and all-deck sessions, keyed like `folder:<id>` or `all`. */
  groupSettings: Record<string, Partial<DeckSettings>>
}

const KEY = 'bf-prefs'
const DEFAULTS: Prefs = { theme: 'system', cardScale: 1, deckDefaults: DEFAULT_DECK_SETTINGS, groupSettings: {} }

function load(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>
    return { ...DEFAULTS, ...saved, deckDefaults: { ...DEFAULT_DECK_SETTINGS, ...saved.deckDefaults } }
  } catch {
    return DEFAULTS
  }
}

let prefs = load()
const listeners = new Set<() => void>()

export function getPrefs(): Prefs {
  return prefs
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Private mode or storage blocked: the change still applies until reload.
  }
  applyPrefs()
  listeners.forEach((l) => l())
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => prefs,
  )
}

const THEME_BG = { light: '#f6f6f3', dark: '#161615' }

export function applyPrefs() {
  const root = document.documentElement
  if (prefs.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', prefs.theme)
  root.style.setProperty('--card-scale', String(prefs.cardScale))
  // index.html has one theme-color per system scheme; a forced theme sets both to its colour.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    const scheme = m.getAttribute('media')?.includes('dark') ? 'dark' : 'light'
    m.setAttribute('content', THEME_BG[prefs.theme === 'system' ? scheme : prefs.theme])
  })
}
