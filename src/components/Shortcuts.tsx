import { useEffect, useState } from 'react'
import { useKeys } from '../lib/hooks'
import { Sheet } from './ui'

const EVENT = 'bf-shortcuts'

export const openShortcuts = () => window.dispatchEvent(new Event(EVENT))

const GROUPS: [string, [string, string][]][] = [
  ['Library', [['/', 'Search'], ['N', 'New deck'], ['?', 'This list']]],
  ['Deck', [['L', 'Learn'], ['F', 'Flashcards'], ['S', 'Spaced review'], ['E', 'Edit deck'], ['Esc', 'Back to library']]],
  [
    'Studying',
    [
      ['Space', 'Flip'],
      ['1 / 2', "Learn: got it / didn't · Flashcards: know / don't know"],
      ['1 to 4', 'Spaced: Again / Hard / Good / Easy'],
      ['Z', 'Undo last answer'],
      ['H', 'Hint'],
      ['R', 'Read aloud'],
      ['E', 'Edit this card'],
      ['*', 'Star this card'],
      ['Esc', 'Close'],
    ],
  ],
  ['Editor', [['Tab', 'Next field (adds a card at the end)'], ['Shift Tab', 'Previous field'], ['Cmd Shift C', 'Make a blank'], ['Esc', 'Done (outside a field)']]],
]

/** Global "?" sheet listing every shortcut. Mounted once in main.tsx. */
export function Shortcuts() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(EVENT, show)
    return () => window.removeEventListener(EVENT, show)
  }, [])
  useKeys((e) => {
    if (e.key === '?') setOpen(true)
  })
  if (!open) return null
  return (
    <Sheet title="Keyboard shortcuts" onClose={() => setOpen(false)}>
      {GROUPS.map(([title, rows]) => (
        <div key={title} style={{ marginBottom: 14 }}>
          <h3 className="section-title" style={{ margin: '4px 0 6px' }}>{title}</h3>
          {rows.map(([k, what]) => (
            <div key={k + what} className="row" style={{ padding: '5px 0', gap: 12 }}>
              <span className="kbd">{k}</span>
              <span className="grow small">{what}</span>
            </div>
          ))}
        </div>
      ))}
    </Sheet>
  )
}
