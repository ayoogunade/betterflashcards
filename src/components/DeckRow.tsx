import { Check, Layers, MoreHorizontal, Pin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { masteryPercent } from '../lib/learn'
import type { CardState, Deck } from '../lib/types'
import { ICON, MasteryBar } from './ui'

interface Props {
  deck: Deck
  count: number
  states: CardState[]
  onMenu?: () => void
  selecting?: boolean
  selected?: boolean
  onToggle?: () => void
  /** Cards due for spaced review now (shown when > 0). */
  due?: number
}

export function DeckRow({ deck, count, states, onMenu, selecting, selected, onToggle, due }: Props) {
  const statuses = states.map((s) => s.status)
  const body = (
    <>
      <div className="deck-icon" style={selecting && selected ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}>
        {selecting && selected ? <Check size={ICON} /> : <Layers size={ICON} />}
      </div>
      <div className="grow">
        <div className="row" style={{ gap: 6 }}>
          <span className="truncate" style={{ fontWeight: 600 }}>{deck.title || 'Untitled deck'}</span>
          {deck.pinned && <Pin size={14} className="muted" aria-label="Pinned" />}
        </div>
        <div className="row small muted" style={{ gap: 10, marginTop: 4 }}>
          <span>{count} cards</span>
          <span>{masteryPercent(statuses)}% mastered</span>
          {!!due && <span style={{ color: 'var(--st-learning)', fontWeight: 600 }}>{due} due</span>}
          {deck.tags.slice(0, 2).map((t) => (
            <span key={t} className="chip">{t}</span>
          ))}
        </div>
        <div style={{ marginTop: 6, maxWidth: 260 }}>
          <MasteryBar statuses={statuses} />
        </div>
      </div>
    </>
  )
  if (selecting)
    return (
      <button className="list-item" onClick={onToggle} aria-pressed={selected}>
        {body}
      </button>
    )
  return (
    <div className="list-item" style={{ padding: 0 }}>
      <Link to={`/deck/${deck.id}`} className="row grow" style={{ padding: '12px 14px', gap: 12 }}>
        {body}
      </Link>
      {onMenu && (
        <button className="icon-btn" style={{ marginRight: 6 }} aria-label={`More actions for ${deck.title}`} onClick={onMenu}>
          <MoreHorizontal size={ICON} />
        </button>
      )}
    </div>
  )
}
