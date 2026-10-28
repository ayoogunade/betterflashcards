import { CalendarCheck, Plus, Undo2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditCardSheet } from '../components/LazyEditCardSheet'
import { StudyCard } from '../components/StudyCard'
import { StudyOptions, StudyShell } from '../components/StudyShell'
import { TypeAnswer } from '../components/TypeAnswer'
import { Empty } from '../components/ui'
import { db, hardDelete, logReview, now } from '../lib/db'
import { backHref, isFlipKey, studyStates, useAddedCards, useDeck, useKeys } from '../lib/hooks'
import { buildItem, speak } from '../lib/render'
import { GRADES, GRADE_LABEL, formatInterval, isDue, newLeftToday, nextDue, preview, schedule, type Grade } from '../lib/srs'
import type { Card, CardState, Rating } from '../lib/types'

const RATING: Record<Grade, Rating> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }

/** Spaced repetition: flip, then Again / Hard / Good / Easy, scheduled by FSRS or fixed intervals. */
export function SpacedMode() {
  const { id } = useParams()
  const data = useDeck(id)
  const nav = useNavigate()
  const [current, setCurrent] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [reviewed, setReviewed] = useState(0)
  const [extraNew, setExtraNew] = useState(0)
  const [undo, setUndo] = useState<{ prev: CardState; logId: string }[]>([])
  const [options, setOptions] = useState(false)
  const [editing, setEditing] = useState<Card | null>(null)
  const [clock, setClock] = useState(Date.now())
  const shownAt = useRef(Date.now())
  const busy = useRef(false)
  const settings = data?.deck.settings
  /** "Review all due" from the library: due cards only; new cards are introduced per deck or folder. */
  const dueOnly = id === 'all'

  // Learning cards come due within minutes, so re-check the queue while waiting on the done screen.
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const eligible = useMemo(() => studyStates(data, settings?.starredOnly), [data, settings?.starredOnly])

  const orderOf = useMemo(() => new Map(data?.cards.map((c, i) => [c.id, i]) ?? []), [data])
  const cardById = useMemo(() => new Map(data?.cards.map((c) => [c.id, c]) ?? []), [data])

  /** Cards added while editing: shown next, ahead of the daily new-card limit, until first answered. */
  const added = useRef<string[]>([])

  /** Next card, using `override` for a just-rated card the live query hasn't caught up with yet. */
  const pick = (override?: CardState, skip?: string) => {
    if (!settings) return
    const states = override ? eligible.map((s) => (s.key === override.key ? override : s)) : eligible
    const t = Date.now()
    const newLeft = dueOnly ? 0 : newLeftToday(states, settings.newPerDay, t) + extraNew
    const unseen = new Set(states.filter((s) => !s.srs).map((s) => s.key))
    added.current = added.current.filter((k) => unseen.has(k))
    const next =
      added.current.find((k) => k !== skip) ??
      nextDue(
        states.map((s) => ({ key: s.key, srs: s.srs, order: (orderOf.get(s.card_id) ?? 0) * 100 + s.sub_index })),
        t,
        newLeft,
        skip,
      )
    setCurrent(next ?? null)
    setDone(!next)
    setFlipped(false)
    shownAt.current = Date.now()
  }

  // First card once loaded; afterwards only re-pick from the done screen (time passed, more new cards, options changed).
  const started = useRef(false)
  useEffect(() => {
    if (!data || !settings) return
    if (!started.current || (done && !current)) {
      started.current = true
      pick()
    }
  }, [data, clock, extraNew]) // eslint-disable-line react-hooks/exhaustive-deps

  const settingsKey = JSON.stringify(settings ?? null)
  const lastSettings = useRef(settingsKey)
  useEffect(() => {
    if (lastSettings.current === settingsKey) return
    lastSettings.current = settingsKey
    if (started.current) pick()
  }, [settingsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const addCards = useAddedCards(data, (keys) => {
    added.current.push(...keys)
    if (done) pick()
  })

  const st = current ? eligible.find((s) => s.key === current) : undefined
  const card = st ? cardById.get(st.card_id) : undefined
  const item = st && card && settings ? buildItem(card, st, settings.direction, 'srs') : null
  const intervals = useMemo(() => (st && settings ? preview(st.srs, new Date(), settings) : null), [st, settings, flipped]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (item && settings?.autoplayTts) speak(item.promptText)
  }, [current]) // eslint-disable-line react-hooks/exhaustive-deps

  const flip = () =>
    setFlipped((f) => {
      if (!f && item && settings?.autoplayTts) speak(item.answerText)
      return !f
    })

  /** Buttons and keys need the card flipped; a swipe answers straight away (right = Good, left = Again). */
  const rate = async (grade: Grade, swiped = false) => {
    if (!st || (!flipped && !swiped) || busy.current || !settings) return
    busy.current = true
    try {
      const next: CardState = { ...st, srs: schedule(st.srs, grade, new Date(), settings), last_review: now(), updated_at: now() }
      await db.cardStates.put(next)
      const logId = await logReview({
        card_id: st.card_id,
        deck_id: st.deck_id,
        sub_index: st.sub_index,
        mode: 'spaced',
        rating: RATING[grade],
        duration_ms: Date.now() - shownAt.current,
      })
      setUndo((u) => [...u, { prev: st, logId }])
      setReviewed((n) => n + 1)
      pick(next, st.key)
    } finally {
      busy.current = false
    }
  }

  const undoLast = async () => {
    const step = undo[undo.length - 1]
    if (!step) return
    await db.cardStates.put(step.prev)
    await hardDelete('reviewLogs', [step.logId])
    setUndo((u) => u.slice(0, -1))
    setReviewed((n) => Math.max(0, n - 1))
    setCurrent(step.prev.key)
    setDone(false)
    setFlipped(true)
  }

  useKeys((e) => {
    if (editing || options) return
    if (e.key === 'Escape') return nav(backHref(id))
    if (done) return
    if (isFlipKey(e)) {
      e.preventDefault()
      flip()
    } else if (['1', '2', '3', '4'].includes(e.key)) void rate(Number(e.key) as Grade)
    // Arrows answer like a swipe: right Good, left Again, no need to flip first.
    else if (e.key === 'ArrowRight') void rate(3, true)
    else if (e.key === 'ArrowLeft') void rate(1, true)
    else if (e.key.toLowerCase() === 'z') void undoLast()
  })

  if (data === undefined || !settings) return null
  if (data === null) return <Empty icon={<X size={40} />} title="Deck not found" />
  const { deck } = data

  const t = Date.now()
  const dueNow = eligible.filter((s) => isDue(s, t)).length
  const newLeft = dueOnly ? 0 : Math.min(eligible.filter((s) => !s.srs).length, newLeftToday(eligible, settings.newPerDay, t) + extraNew)
  const remaining = dueNow + newLeft
  const nextAt = eligible.reduce((m, s) => (s.srs ? Math.min(m, Date.parse(s.srs.due)) : m), Infinity)
  const unseen = eligible.filter((s) => !s.srs).length

  return (
    <StudyShell deck={deck} progress={reviewed + remaining ? reviewed / (reviewed + remaining) : 1} onOptions={() => setOptions(true)}>
      <div className="pile-counts">
        <span style={{ color: 'var(--st-almost)' }}>
          <span className="n">{newLeft}</span>New
        </span>
        <span className="muted small" style={{ alignSelf: 'center' }}>
          {settings.srsMode === 'fsrs' ? 'FSRS' : 'Fixed intervals'}
        </span>
        <span style={{ color: 'var(--st-learning)' }}>
          Due<span className="n">{dueNow}</span>
        </span>
      </div>

      {eligible.length === 0 ? (
        <Empty icon={<X size={40} />} title={settings.starredOnly ? 'No starred cards' : 'No cards to study'} />
      ) : done || !item ? (
        <Empty icon={<CalendarCheck size={44} />} title="All caught up">
          <p>
            {reviewed > 0 ? `${reviewed} reviewed this session. ` : ''}
            {Number.isFinite(nextAt) ? `Next review in ${formatInterval(Math.max(0, nextAt - t))}.` : 'Nothing scheduled yet.'}
          </p>
          <div className="row wrap" style={{ justifyContent: 'center', gap: 10, marginTop: 12 }}>
            {unseen > 0 && !dueOnly && (
              <button className="btn" onClick={() => setExtraNew((n) => n + Math.max(1, settings.newPerDay))}>
                <Plus size={18} /> {Math.min(unseen, Math.max(1, settings.newPerDay))} more new cards
              </button>
            )}
            <button className="btn btn-primary" onClick={() => nav(backHref(id))} autoFocus>
              Done
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
            onSwipe={(d) => rate(d === 'right' ? 3 : 1, true)}
            onEdit={() => setEditing(item.card)}
            keys={!editing && !options}
            badge={!st?.srs ? <span className="badge badge-new">New</span> : undefined}
            swipeLabels={{ left: 'Again', right: 'Good' }}
          />
          {settings.typeAnswer && <TypeAnswer item={item} flipped={flipped} onSubmit={flip} />}
          {flipped && intervals ? (
            <div className="grade four">
              {GRADES.map((g) => (
                <button key={g} onClick={() => rate(g)} aria-label={`${GRADE_LABEL[g]}, next in ${formatInterval(intervals[g])}`}>
                  <span className="ivl">{formatInterval(intervals[g])}</span>
                  <span className={`g${g}`}>{GRADE_LABEL[g]}</span>
                  <span className="key">{g}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grade flip-only">
              <button onClick={flip}>Flip</button>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'center', marginTop: 6 }}>
            {undo.length > 0 && (
              <button className="btn btn-ghost small" onClick={undoLast} aria-label="Undo last answer">
                <Undo2 size={16} /> Undo
              </button>
            )}
          </div>
          <div className="kbd-hint">Space / Enter / ↑↓ flip · 1–4 or ← again, → good · Z undo</div>
        </>
      )}

      {options && (
        <StudyOptions
          deck={deck}
          show={['srsMode', 'newPerDay', 'retention', 'fixedMinutes', 'examDate', 'direction', 'typeAnswer', 'starredOnly', 'autoplayTts']}
          reset="schedule"
          onClose={() => setOptions(false)}
          onReset={() => (setCurrent(null), setDone(true))}
        />
      )}
      {editing && <EditCardSheet card={editing} onClose={() => setEditing(null)} onAdded={addCards} />}
    </StudyShell>
  )
}
