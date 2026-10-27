import { ArrowLeft, Layers, RotateCcw, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Empty, ICON } from '../components/ui'
import { destroyDeck, restoreDeck } from '../lib/db'
import { useDecks } from '../lib/hooks'

export function Trash() {
  const data = useDecks()
  if (!data) return null
  const trashed = data.decks.filter((d) => d.deleted_at).sort((a, b) => b.deleted_at!.localeCompare(a.deleted_at!))
  return (
    <div className="page">
      <div className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back to library">
          <ArrowLeft size={ICON} />
        </Link>
        <h1>Trash</h1>
      </div>
      <p className="small muted">Decks here are deleted for good 30 days after they were trashed.</p>
      {trashed.length === 0 ? (
        <Empty icon={<Trash2 size={40} />} title="Trash is empty" />
      ) : (
        <div className="list">
          {trashed.map((d) => {
            const days = Math.max(0, 30 - Math.floor((Date.now() - Date.parse(d.deleted_at!)) / 86400_000))
            return (
              <div className="list-item" key={d.id}>
                <div className="deck-icon">
                  <Layers size={ICON} />
                </div>
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{d.title || 'Untitled deck'}</div>
                  <div className="small muted">
                    {data.counts.get(d.id) ?? 0} cards · {days} days left
                  </div>
                </div>
                <button className="icon-btn" aria-label={`Restore ${d.title}`} title="Restore" onClick={() => restoreDeck(d.id)}>
                  <RotateCcw size={ICON} />
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Delete ${d.title} forever`}
                  title="Delete forever"
                  onClick={() => confirm(`Delete "${d.title}" forever? This can't be undone.`) && destroyDeck(d.id)}
                >
                  <Trash2 size={ICON} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
