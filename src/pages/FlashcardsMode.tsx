import { ChevronLeft, ChevronRight, RotateCcw, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditCardSheet } from '../components/LazyEditCardSheet'
import { StudyCard } from '../components/StudyCard'
import { StudyOptions, StudyShell } from '../components/StudyShell'
import { Empty } from '../components/ui'
import { db, hardDelete, logReview, now } from '../lib/db'
import { backHref, isFlipKey, studyStates, useAddedCards, useDeck, useGoneCards, useKeys } from '../lib/hooks'
import { dropKeys, shuffled } from '../lib/learn'
import { buildItem, speak } from '../lib/render'
import type { Card, CardState } from '../lib/types'

/** Flip through every card. With sorting on, each card goes to Know or Don't know. */
export function FlashcardsMode() {
  const { id } = useParams()
  const data = useDeck(id)
  const nav = useNavigate()
  const [order, setOrder] = useState<string[] | null>(null)
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [undo, setUndo] = useState<{ pos: number; prev: CardState; logId: string }[]>([])
  const [options, setOptions] = useState(false)
  const [editing, setEditing] = useState<Card | null>(null)
  const shownAt = useRef(Date.now())
  const settings = data?.deck.settings

  const eligible = useMemo(() => {
    const idx = new Map(data?.cards.map((c, i) => [c.id, i]))
    return studyStates(data, settings?.starredOnly).sort((a, b) => idx.get(a.card_id)! - idx.get(b.card_id)! || a.sub_index - b.sub_index)
  }, [data, settings?.starredOnly])
  // Cards added while editing come up next (or right away from the end screen).
  const addCards = useAddedCards(data, (keys) =>
    setOrder((o) => {
      if (!o) return o
      const at = Math.min(o.length, pos >= o.length ? pos : pos + 1)
      return [...o.slice(0, at), ...keys, ...o.slice(at)]
    }),
  )

  // Deleted cards drop out; undo steps hold positions in the old order, so they go too.
  useGoneCards(data, (gone) => {
    if (!order) return
    const next = dropKeys(order, pos, gone)
    setOrder(next.queue)
    setPos(next.pos)
    setUndo([])
  })

  const stateByKey = useMemo(() => new Map(data?.states.map((s) => [s.key, s]) ?? []), [data])
  const cardById = useMemo(() => new Map(data?.cards.map((c) => [c.id, c]) ?? []), [data])

  /** Session order: with sorting, only cards not yet in a pile; otherwise every card. */
  const build = () => {
    const pool = settings?.sortPiles ? eligible.filter((s) => !s.know_pile) : eligible
    const keys = pool.map((s) => s.key)
    setOrder(settings?.shuffle ? shuffled(keys) : keys)
    setPos(0)
    setFlipped(false)
    setUndo([])
  }

  const settingsKey = JSON.stringify(settings ?? null)
  useEffect(() => {
    if (data) build()
  }, [!!data, settingsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // After "Reset progress" in Options, rebuild once the cleared piles reach the live data.
  const pendingRebuild = useRef(false)
  useEffect(() => {
    if (data && pendingRebuild.current) {
      pendingRebuild.current = false
      build()
    }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const key = order?.[pos]
  const st = key ? stateByKey.get(key) : undefined
  const card = st ? cardById.get(st.card_id) : undefined
  const item = st && card && settings ? buildItem(card, st, settings.direction, 'fc') : null

  useEffect(() => {
    shownAt.current = Date.now()
    if (item && settings?.autoplayTts) speak(item.promptText)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const flip = () =>
    setFlipped((f) => {
      if (!f && item && settings?.autoplayTts) speak(item.answerText)
      return !f
    })

  const sortCard = async (know: boolean) => {
    if (!st || !order) return
    await db.cardStates.put({ ...st, know_pile: know ? 'know' : 'dont_know', updated_at: now() })
    const logId = await logReview({
      card_id: st.card_id,
      deck_id: st.deck_id,
      sub_index: st.sub_index,
      mode: 'flashcards',
      rating: know ? 'know' : 'dont_know',
      duration_ms: Date.now() - shownAt.current,
    })
    setUndo((u) => [...u, { pos, prev: st, logId }])
    setPos((p) => p + 1)
    setFlipped(false)
  }

  const undoLast = async () => {
    const step = undo[undo.length - 1]
    if (!step) return
    await db.cardStates.put(step.prev)
    await hardDelete('reviewLogs', [step.logId])
    setUndo((u) => u.slice(0, -1))
    setPos(step.pos)
    setFlipped(true)
  }

  const go = (d: number) => {
    if (!order) return
    setPos((p) => Math.max(0, Math.min(order.length - 1, p + d)))
    setFlipped(false)
  }

  const clearPiles = async (which: 'all' | 'dont_know') => {
    const t = now()
    const targets = eligible.filter((s) => (which === 'all' ? s.know_pile : s.know_pile === 'dont_know'))
    await db.cardStates.bulkPut(targets.map((s) => ({ ...s, know_pile: null, updated_at: t })))
    // Rebuild from the fresh rows rather than waiting for the live query.
    const cleared = new Set(targets.map((s) => s.key))
    const keys = eligible.filter((s) => cleared.has(s.key) || !s.know_pile).map((s) => s.key)
    setOrder(settings?.shuffle ? shuffled(keys) : keys)
    setPos(0)
    setFlipped(false)
    setUndo([])
  }

  useKeys((e) => {
    if (editing || options) return
    if (e.key === 'Escape') return nav(backHref(id))
    if (isFlipKey(e)) {
      e.preventDefault()
      flip()
    } else if (settings?.sortPiles && ((flipped && e.key === '1') || e.key === 'ArrowRight')) void sortCard(true)
    else if (settings?.sortPiles && ((flipped && e.key === '2') || e.key === 'ArrowLeft')) void sortCard(false)
    else if (!settings?.sortPiles && e.key === 'ArrowRight') go(1)
    else if (!settings?.sortPiles && e.key === 'ArrowLeft') go(-1)
    else if (e.key.toLowerCase() === 'z') void undoLast()
  })

  if (data === undefined || !order) return null
  if (data === null) return <Empty icon={<X size={40} />} title="Deck not found" />
  const { deck } = data
  const know = eligible.filter((s) => s.know_pile === 'know').length
  const dontKnow = eligible.filter((s) => s.know_pile === 'dont_know').length
  const sorting = settings!.sortPiles
  const finished = pos >= order.length

  return (
    <StudyShell deck={deck} progress={order.length ? pos / order.length : 1} onOptions={() => setOptions(true)}>
      {sorting && (
        <div className="pile-counts">
          <span style={{ color: 'var(--st-learning)' }}>
            <span className="n">{dontKnow}</span>Don't know
          </span>
          <span className="muted small" style={{ alignSelf: 'center' }}>
            {Math.min(pos + 1, order.length)}/{order.length}
          </span>
          <span style={{ color: 'var(--st-mastered)' }}>
            Know<span className="n">{know}</span>
          </span>
        </div>
      )}

      {eligible.length === 0 ? (
        <Empty icon={<X size={40} />} title={settings?.starredOnly ? 'No starred cards' : 'No cards to study'} />
      ) : finished || !item ? (
        <Empty icon={<RotateCcw size={40} />} title={sorting ? 'All cards sorted' : 'End of deck'}>
          {sorting && (
            <p>
              Know {know} · Don't know {dontKnow}
            </p>
          )}
          <div className="row wrap" style={{ justifyContent: 'center', gap: 10, marginTop: 12 }}>
            {sorting && dontKnow > 0 && (
              <button className="btn btn-primary" onClick={() => clearPiles('dont_know')} autoFocus>
                Study don't know ({dontKnow})
              </button>
            )}
            <button className="btn" onClick={() => (sorting ? clearPiles('all') : build())}>
              <RotateCcw size={18} /> Restart
            </button>
            {undo.length > 0 && (
              <button className="btn btn-ghost" onClick={undoLast}>
                <Undo2 size={18} /> Undo
              </button>
            )}
          </div>
        </Empty>
      ) : (
        <>
          <StudyCard
            item={item}
            flipped={flipped}
            onFlip={flip}
            onSwipe={sorting ? (d) => sortCard(d === 'right') : (d) => go(d === 'right' ? -1 : 1)}
            onEdit={() => setEditing(item.card)}
            keys={!editing && !options}
            swipeLabels={sorting ? { left: "Don't know", right: 'Know' } : undefined}
          />
          {sorting ? (
            flipped ? (
              <div className="grade">
                <button onClick={() => sortCard(false)}>
                  <span className="key">2</span>
                  <span className="miss">Don't know</span>
                </button>
                <button onClick={() => sortCard(true)}>
                  <span className="key">1</span>
                  <span className="got">Know</span>
                </button>
              </div>
            ) : (
              <div className="grade flip-only">
                <button onClick={flip}>Flip</button>
              </div>
            )
          ) : (
            <div className="grade">
              <button onClick={() => go(-1)} disabled={pos === 0} aria-label="Previous card">
                <ChevronLeft size={22} />
              </button>
              <button onClick={() => go(1)} disabled={pos >= order.length - 1} aria-label="Next card">
                <ChevronRight size={22} />
              </button>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
            {undo.length > 0 && (
              <button className="btn btn-ghost small" onClick={undoLast}>
                <Undo2 size={16} /> Undo
              </button>
            )}
          </div>
          <div className="kbd-hint">{sorting ? 'Space / Enter / ↑↓ flip · → know · ← don\'t know · Z undo' : 'Space / Enter / ↑↓ flip · ←→ move'}</div>
        </>
      )}

      {options && (
        <StudyOptions
          deck={deck}
          show={['direction', 'sortPiles', 'starredOnly', 'shuffle', 'autoplayTts']}
          onClose={() => setOptions(false)}
          onReset={() => (pendingRebuild.current = true)}
        />
      )}
      {editing && <EditCardSheet card={editing} onClose={() => setEditing(null)} onAdded={addCards} />}
    </StudyShell>
  )
}
