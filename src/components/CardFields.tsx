import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hasCloze } from '../lib/cloze'
import { db, deckCards, deleteCard, insertCardAt, isBlankCard, updateCard } from '../lib/db'
import { highlightClozeSource, renderMath } from '../lib/render'
import type { Card, CardType } from '../lib/types'
import { RichEditor } from './RichEditor'
import { Seg, Sheet } from './ui'

/** Debounced card save; flushes on unmount so nothing typed is lost. */
export function useCardSaver(cardId: string) {
  const pending = useRef<Partial<Card>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) void updateCard(cardId, patch)
  }
  useEffect(() => flush, [cardId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (patch: Partial<Card>) => {
    pending.current = { ...pending.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 350)
  }
}

interface FieldsProps {
  card: Card
  focus?: 'front' | 'back'
  onTabOut?: () => void
  onShiftTabOut?: () => void
}

/** Type switch + the two rich-text sides of one card. Used by the deck editor and the in-study edit sheet. */
export function CardFields({ card, focus = 'front', onTabOut, onShiftTabOut }: FieldsProps) {
  const save = useCardSaver(card.id)
  const [type, setType] = useState<CardType>(card.type)
  const [field, setField] = useState<'front' | 'back'>(focus)

  // What the editors show. `latest` tracks typing without re-rendering; `ver` remounts both editors
  // after a swap, so even the one being typed in shows its new text.
  const latest = useRef({ front: card.front, back: card.back })
  const [sides, setSides] = useState(latest.current)
  const [ver, setVer] = useState(0)
  useEffect(() => {
    // An outside change (another device, the editor's header buttons), not our own save echoing back.
    if (card.front !== latest.current.front || card.back !== latest.current.back) {
      latest.current = { front: card.front, back: card.back }
      setSides(latest.current)
    }
  }, [card.front, card.back])

  const swap = () => {
    const next = { front: latest.current.back, back: latest.current.front }
    latest.current = next
    setSides(next)
    setVer((v) => v + 1)
    save(next)
  }

  const setFrontAndType = (html: string) => {
    latest.current = { ...latest.current, front: html }
    // Typing {{...}} into a basic card turns it into a cloze card automatically.
    if (type === 'basic' && hasCloze(html)) {
      setType('cloze')
      save({ front: html, type: 'cloze' })
    } else save({ front: html })
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <Seg<CardType>
          value={type}
          options={[
            { value: 'basic', label: 'Basic' },
            { value: 'cloze', label: 'Fill in the blank' },
          ]}
          onChange={(t) => {
            setType(t)
            save({ type: t })
          }}
        />
        {type === 'basic' && (
          <button type="button" className="btn btn-ghost small" style={{ marginLeft: 'auto' }} onClick={swap} aria-label="Swap term and definition" title="Swap term and definition">
            <ArrowLeftRight size={16} /> Swap
          </button>
        )}
      </div>
      <div className="sides">
        <div onFocusCapture={() => setField('front')}>
          <div className="side-label">{type === 'cloze' ? 'Text with {{blanks}}' : 'Term'}</div>
          <div className="side-box">
            <RichEditor
              key={`${card.id}-front-${ver}`}
              value={sides.front}
              placeholder={type === 'cloze' ? '{{Donald Trump}} was the 45th president' : 'Term'}
              autofocus={ver ? field === 'front' : focus === 'front'}
              focused={field === 'front'}
              toolbar={field === 'front'}
              onChange={setFrontAndType}
              onTab={() => setField('back')}
              onShiftTab={onShiftTabOut}
            />
          </div>
        </div>
        <div onFocusCapture={() => setField('back')}>
          <div className="side-label">{type === 'cloze' ? 'Extra info (optional)' : 'Definition'}</div>
          <div className="side-box">
            <RichEditor
              key={`${card.id}-back-${ver}`}
              value={sides.back}
              placeholder={type === 'cloze' ? 'Shown after flipping' : 'Definition'}
              autofocus={ver ? field === 'back' : focus === 'back'}
              focused={field === 'back'}
              toolbar={field === 'back'}
              onChange={(html) => {
                latest.current = { ...latest.current, back: html }
                save({ back: html })
              }}
              onTab={onTabOut}
              onShiftTab={() => setField('front')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Read-only view of a card's sides; tapping a side opens it for editing. */
export function CardPreview({ card, onOpen }: { card: Card; onOpen: (field: 'front' | 'back') => void }) {
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

/**
 * The "Edit card" sheet (deck page, quick add, search, study screens). "Add card" adds more cards right
 * after this one in the same sheet; the open card is editable and the others show as previews to tap.
 * New cards left empty are removed when the sheet closes.
 */
export function EditCardSheet({ card, onClose }: { card: Card; onClose: () => void }) {
  const [ids, setIds] = useState([card.id])
  const [active, setActive] = useState<{ id: string; field: 'front' | 'back' }>({ id: card.id, field: 'front' })
  const created = useRef<string[]>([])
  const live = useLiveQuery(() => db.cards.bulkGet(ids), [ids])
  const cards = ids.map((id, i) => live?.[i] ?? (id === card.id ? card : undefined)).filter((c): c is Card => !!c && !c.deleted_at)

  const add = async () => {
    // Insert after the last card in this sheet, keeping the new cards together in the deck.
    const order = (await deckCards(card.deck_id)).map((c) => c.id)
    const after = Math.max(...ids.map((id) => order.indexOf(id)))
    const c = await insertCardAt(card.deck_id, after + 1)
    created.current.push(c.id)
    setIds((x) => [...x, c.id])
    setActive({ id: c.id, field: 'front' })
  }

  const remove = async (id: string) => {
    await deleteCard(id)
    setIds((x) => x.filter((y) => y !== id))
    if (active.id === id) setActive({ id: card.id, field: 'front' })
  }

  const close = async () => {
    // Let the open card's debounced save land before checking for empty new cards.
    setActive({ id: '', field: 'front' })
    await new Promise((r) => setTimeout(r, 100))
    for (const id of created.current) {
      const c = await db.cards.get(id)
      if (c && !c.deleted_at && isBlankCard(c)) await deleteCard(id)
    }
    onClose()
  }

  return (
    <Sheet title={cards.length > 1 ? `Edit ${cards.length} cards` : 'Edit card'} onClose={close}>
      {cards.map((c, i) => (
        <div key={c.id} className={`sheet-card ${active.id === c.id ? 'active' : ''}`}>
          {cards.length > 1 && (
            <div className="row" style={{ marginBottom: 4 }}>
              <span className="side-label grow" style={{ margin: 0 }}>
                {i === 0 ? 'Card' : `New card ${i}`}
              </span>
              {created.current.includes(c.id) && (
                <button className="icon-btn sm" aria-label={`Remove new card ${i}`} onClick={() => remove(c.id)}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          )}
          {active.id === c.id ? (
            <CardFields
              key={c.id}
              card={c}
              focus={active.field}
              onTabOut={() => {
                const next = cards[i + 1]
                if (next) setActive({ id: next.id, field: 'front' })
                else void add()
              }}
              onShiftTabOut={() => {
                const prev = cards[i - 1]
                if (prev) setActive({ id: prev.id, field: 'back' })
              }}
            />
          ) : (
            <CardPreview card={c} onOpen={(field) => setActive({ id: c.id, field })} />
          )}
        </div>
      ))}
      <button className="btn btn-block" style={{ marginTop: 12, borderStyle: 'dashed' }} onClick={() => void add()}>
        <Plus size={18} /> Add card
      </button>
      <button className="btn btn-primary btn-block" style={{ marginTop: 10 }} onClick={() => void close()}>
        Done
      </button>
    </Sheet>
  )
}
