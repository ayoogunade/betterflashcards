import { ArrowDown, ArrowLeftRight, ArrowUp, Check, FileInput, GripVertical, Plus, Repeat, Search, Star, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CardFields } from '../components/CardFields'
import { ImportSheet } from '../components/ImportSheet'
import { ICON, useToast } from '../components/ui'
import { addCard, db, deleteCard, htmlToText, insertCardAt, now, reorderCards, updateCard, updateDeck } from '../lib/db'
import { useDeck, useKeys } from '../lib/hooks'
import { highlightClozeSource, renderMath } from '../lib/render'
import type { Card } from '../lib/types'

export function EditDeck() {
  const { id } = useParams()
  const data = useDeck(id)
  const toast = useToast()
  const [active, setActive] = useState<{ id: string; field: 'front' | 'back' } | null>(null)
  const [importing, setImporting] = useState(false)
  const [q, setQ] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const listEnd = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  useKeys((e) => {
    if (e.key === 'Escape' && !importing && id) nav(`/deck/${id}`)
  })

  // A brand-new empty deck starts with one card open, ready to type.
  const seeded = useRef(false)
  useEffect(() => {
    if (data && !seeded.current) {
      seeded.current = true
      if (data.cards.length === 0) void addCard(data.deck.id, { type: 'basic', front: '', back: '' }).then((c) => setActive({ id: c.id, field: 'front' }))
    }
  }, [data])

  if (!data) return null
  const { deck, cards } = data

  const term = q.trim().toLowerCase()
  const shown = term ? cards.filter((c) => (htmlToText(c.front) + ' ' + htmlToText(c.back)).toLowerCase().includes(term)) : cards

  const newCard = async () => {
    const c = await addCard(deck.id, { type: 'basic', front: '', back: '' })
    setActive({ id: c.id, field: 'front' })
    setTimeout(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
  }

  const move = async (card: Card, delta: number) => {
    const ids = cards.map((c) => c.id)
    const i = ids.indexOf(card.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await reorderCards(ids)
  }

  const dropOn = async (targetId: string) => {
    if (!dragId || dragId === targetId) return
    const ids = cards.map((c) => c.id).filter((x) => x !== dragId)
    ids.splice(ids.indexOf(targetId), 0, dragId)
    await reorderCards(ids)
  }

  const swapAll = async () => {
    if (!confirm('Swap term and definition on every basic card?')) return
    const t = now()
    await db.cards.bulkUpdate(cards.filter((c) => c.type === 'basic').map((c) => ({ key: c.id, changes: { front: c.back, back: c.front, updated_at: t } })))
    toast.show({ msg: 'Swapped all sides' })
  }

  const remove = async (c: Card) => {
    await deleteCard(c.id)
    if (active?.id === c.id) setActive(null)
    toast.show({ msg: 'Card deleted', action: { label: 'Undo', run: () => updateCard(c.id, { deleted_at: null }) } })
  }

  return (
    <div className="page">
      <div className="topbar">
        <Link to={`/deck/${deck.id}`} className="btn btn-primary" aria-label="Done editing">
          <Check size={18} /> Done
        </Link>
        <span className="spacer" />
        <button className="btn" onClick={() => setImporting(true)}>
          <FileInput size={18} /> Import
        </button>
        <button className="icon-btn" aria-label="Swap term and definition on all cards" title="Swap all sides" onClick={swapAll}>
          <Repeat size={ICON} />
        </button>
      </div>

      <input
        className="input title-input"
        placeholder="Deck title"
        defaultValue={deck.title === 'Untitled deck' ? '' : deck.title}
        onChange={(e) => updateDeck(deck.id, { title: e.target.value.trim() || 'Untitled deck' })}
        aria-label="Deck title"
      />
      <input
        className="input"
        style={{ border: 'none', background: 'transparent', padding: '2px 0 10px' }}
        placeholder="Description (optional)"
        defaultValue={deck.description}
        onChange={(e) => updateDeck(deck.id, { description: e.target.value })}
        aria-label="Description"
      />

      {cards.length > 8 && (
        <div className="search" style={{ marginBottom: 12 }}>
          <Search size={18} />
          <input
            className="input"
            type="search"
            placeholder={`Search ${cards.length} cards`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search cards"
          />
        </div>
      )}

      {shown.map((c) => {
        const isActive = active?.id === c.id
        const index = cards.indexOf(c)
        return (
          <Fragment key={c.id}>
            {index > 0 && !term && (
              <div className="card-insert">
                <button
                  className="icon-btn sm"
                  aria-label={`Add a card between ${index} and ${index + 1}`}
                  title="Add a card here"
                  onClick={async () => setActive({ id: (await insertCardAt(deck.id, index)).id, field: 'front' })}
                >
                  <Plus size={16} />
                </button>
              </div>
            )}
            <div
              className={`editor-card ${isActive ? 'active' : ''} ${overId === c.id ? 'drag-over' : ''}`}
              onDragOver={(e) => {
                if (!dragId) return
                e.preventDefault()
                setOverId(c.id)
              }}
              onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault()
                void dropOn(c.id)
                setDragId(null)
                setOverId(null)
              }}
            >
              <div className="head">
                <span
                  className="icon-btn sm"
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => (setDragId(null), setOverId(null))}
                  title="Drag to reorder"
                  aria-hidden
                  style={{ cursor: 'grab' }}
                >
                  <GripVertical size={16} />
                </span>
                <span className="idx">{index + 1}</span>
                <span className="grow" />
                <button className="icon-btn sm" aria-label="Move up" disabled={index === 0} onClick={() => move(c, -1)}>
                  <ArrowUp size={16} />
                </button>
                <button className="icon-btn sm" aria-label="Move down" disabled={index === cards.length - 1} onClick={() => move(c, 1)}>
                  <ArrowDown size={16} />
                </button>
                {c.type === 'basic' && (
                  <button
                    className="icon-btn sm"
                    aria-label="Swap term and definition"
                    title="Swap sides"
                    onClick={() => updateCard(c.id, { front: c.back, back: c.front })}
                  >
                    <ArrowLeftRight size={16} />
                  </button>
                )}
                <button
                  className={`icon-btn sm ${c.starred ? 'star-on' : ''}`}
                  aria-label={c.starred ? 'Unstar' : 'Star'}
                  onClick={() => updateCard(c.id, { starred: !c.starred })}
                >
                  <Star size={16} fill={c.starred ? 'currentColor' : 'none'} />
                </button>
                <button className="icon-btn sm" aria-label="Delete card" onClick={() => remove(c)}>
                  <Trash2 size={16} />
                </button>
              </div>
              {isActive ? (
                <CardFields
                  key={c.id}
                  card={c}
                  focus={active.field}
                  onTabOut={() => {
                    const next = cards[index + 1]
                    if (next) setActive({ id: next.id, field: 'front' })
                    else void newCard()
                  }}
                  onShiftTabOut={() => {
                    const prev = cards[index - 1]
                    if (prev) setActive({ id: prev.id, field: 'back' })
                  }}
                />
              ) : (
                <CardPreview card={c} onOpen={(field) => setActive({ id: c.id, field })} />
              )}
            </div>
          </Fragment>
        )
      })}
      <div ref={listEnd} />

      <button className="btn btn-block btn-lg" style={{ marginTop: 6, borderStyle: 'dashed' }} onClick={() => newCard()}>
        <Plus size={20} /> Add card
      </button>
      <p className="small muted" style={{ textAlign: 'center' }}>
        Tab moves to the next field. Select text and press Cmd+Shift+C to make a blank.
      </p>

      {importing && (
        <ImportSheet
          deckId={deck.id}
          hasCards={cards.some((c) => htmlToText(c.front) || htmlToText(c.back))}
          onClose={() => setImporting(false)}
          onDone={(n) => {
            setImporting(false)
            toast.show({ msg: `Imported ${n} cards` })
          }}
        />
      )}
      {toast.node}
    </div>
  )
}

function CardPreview({ card, onOpen }: { card: Card; onOpen: (field: 'front' | 'back') => void }) {
  if (card.type === 'cloze')
    return (
      <div
        className="side-box rich"
        onClick={() => onOpen('front')}
        dangerouslySetInnerHTML={{ __html: renderMath(highlightClozeSource(card.front)) || '<span class="muted">Fill in the blank</span>' }}
      />
    )
  return (
    <div className="sides">
      <div>
        <div className="side-label">Term</div>
        <div
          className={`side-box rich ${card.front ? '' : 'placeholder'}`}
          onClick={() => onOpen('front')}
          dangerouslySetInnerHTML={{ __html: renderMath(card.front) || 'Term' }}
        />
      </div>
      <div>
        <div className="side-label">Definition</div>
        <div
          className={`side-box rich ${card.back ? '' : 'placeholder'}`}
          onClick={() => onOpen('back')}
          dangerouslySetInnerHTML={{ __html: renderMath(card.back) || 'Definition' }}
        />
      </div>
    </div>
  )
}
