import { ArrowDown, ArrowLeftRight, ArrowUp, Check, CheckSquare, FileInput, FolderInput, GripVertical, ListChecks, Plus, Repeat, Search, Square, Star, Trash2, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CardFields } from '../components/CardFields'
import { ImportSheet } from '../components/ImportSheet'
import { ICON, Sheet, useToast } from '../components/ui'
import { addCard, alive, db, deleteCard, htmlToText, insertCardAt, moveCards, now, removeBlankCards, reorderCards, updateCard, updateDeck } from '../lib/db'
import { useDeck, useDecks, useKeys } from '../lib/hooks'
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
  /** Bulk select: null when off, otherwise the picked card ids. */
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [moving, setMoving] = useState(false)
  const allDecks = useDecks()
  useKeys((e) => {
    if (e.key !== 'Escape' || importing || moving || !id) return
    if (picked) setPicked(null)
    else nav(`/deck/${id}`)
  })

  // Cards left completely empty (an unused + or Add card) are removed when you leave the editor.
  useEffect(() => {
    return () => {
      if (id) void removeBlankCards(id)
    }
  }, [id])

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

  const pick = (cardId: string) =>
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  const pickedIds = picked ? cards.filter((c) => picked.has(c.id)).map((c) => c.id) : []

  const bulkDelete = async () => {
    const t = now()
    await db.cards.bulkUpdate(pickedIds.map((key) => ({ key, changes: { deleted_at: t, updated_at: t } })))
    const ids = pickedIds
    setPicked(null)
    toast.show({
      msg: `Deleted ${ids.length} cards`,
      action: { label: 'Undo', run: () => void db.cards.bulkUpdate(ids.map((key) => ({ key, changes: { deleted_at: null, updated_at: now() } }))) },
    })
  }
  const bulkStar = async () => {
    const t = now()
    const star = !cards.filter((c) => picked?.has(c.id)).every((c) => c.starred)
    await db.cards.bulkUpdate(pickedIds.map((key) => ({ key, changes: { starred: star, updated_at: t } })))
    toast.show({ msg: `${star ? 'Starred' : 'Unstarred'} ${pickedIds.length} cards` })
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
        <button
          className={`icon-btn ${picked ? 'on' : ''}`}
          aria-label={picked ? 'Stop selecting' : 'Select cards'}
          title="Select several cards"
          aria-pressed={!!picked}
          onClick={() => setPicked(picked ? null : new Set())}
        >
          <ListChecks size={ICON} />
        </button>
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
                {picked && (
                  <button
                    className={`icon-btn sm ${picked.has(c.id) ? 'on' : ''}`}
                    aria-label={picked.has(c.id) ? `Deselect card ${index + 1}` : `Select card ${index + 1}`}
                    aria-pressed={picked.has(c.id)}
                    onClick={() => pick(c.id)}
                  >
                    {picked.has(c.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                )}
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
                {/* The open card has its own Swap button next to Basic / Fill in the blank. */}
                {c.type === 'basic' && !isActive && (
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

      {picked && (
        <div className="bulk-bar" role="toolbar" aria-label="Selected cards">
          <button className="icon-btn" aria-label="Stop selecting" onClick={() => setPicked(null)}>
            <X size={ICON} />
          </button>
          <span className="grow small" style={{ fontWeight: 600 }}>
            {pickedIds.length} selected
          </span>
          <button className="btn btn-ghost small" onClick={() => setPicked(pickedIds.length === shown.length ? new Set() : new Set(shown.map((c) => c.id)))}>
            {pickedIds.length === shown.length ? 'None' : 'All'}
          </button>
          <button className="icon-btn" aria-label="Star or unstar selected" title="Star" disabled={!pickedIds.length} onClick={bulkStar}>
            <Star size={ICON} />
          </button>
          <button className="icon-btn" aria-label="Move selected to another deck" title="Move to deck" disabled={!pickedIds.length} onClick={() => setMoving(true)}>
            <FolderInput size={ICON} />
          </button>
          <button className="icon-btn" aria-label="Delete selected" title="Delete" disabled={!pickedIds.length} onClick={bulkDelete} style={{ color: 'var(--danger)' }}>
            <Trash2 size={ICON} />
          </button>
        </div>
      )}
      {moving && (
        <Sheet title={`Move ${pickedIds.length} cards to`} onClose={() => setMoving(false)}>
          <div className="menu">
            {(allDecks?.decks ?? [])
              .filter((d) => alive(d) && d.id !== deck.id)
              .sort((a, b) => a.title.localeCompare(b.title))
              .map((d) => (
                <button
                  key={d.id}
                  onClick={async () => {
                    await moveCards(pickedIds, d.id)
                    setMoving(false)
                    setPicked(null)
                    toast.show({ msg: `Moved ${pickedIds.length} cards to ${d.title}` })
                  }}
                >
                  <FolderInput size={ICON} /> {d.title || 'Untitled deck'}
                </button>
              ))}
          </div>
        </Sheet>
      )}
      {importing && (
        <ImportSheet
          deckId={deck.id}
          existing={cards}
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
