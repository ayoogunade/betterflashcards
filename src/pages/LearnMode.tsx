import { Check, PartyPopper, RotateCcw, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditCardSheet } from '../components/LazyEditCardSheet'
import { StudyCard } from '../components/StudyCard'
import { StudyOptions, StudyShell } from '../components/StudyShell'
import { TypeAnswer } from '../components/TypeAnswer'
import { Empty, MasteryBar, StatGrid, StatusBadge } from '../components/ui'
import { db, hardDelete, logReview, now, resetProgress } from '../lib/db'
import { backHref, isFlipKey, studyStates, useAddedCards, useDeck, useKeys } from '../lib/hooks'
import {
  answerRound,
  applyRating,
  currentKey,
  isRoundDone,
  masteryPercent,
  pickRound,
  roundScore,
  startRound,
  type RoundState,
} from '../lib/learn'
import { buildItem, speak, type StudyItem } from '../lib/render'
import type { Card, CardState } from '../lib/types'

type Phase = 'card' | 'summary' | 'complete' | 'empty'

interface UndoStep {
  round: RoundState
  prev: CardState
  logId: string
}

export function LearnMode() {
  const { id } = useParams()
  const data = useDeck(id)
  const nav = useNavigate()
  const [round, setRound] = useState<RoundState | null>(null)
  const [roundNo, setRoundNo] = useState(0)
  const [phase, setPhase] = useState<Phase>('card')
  const [flipped, setFlipped] = useState(false)
  const [undo, setUndo] = useState<UndoStep[]>([])
  const [options, setOptions] = useState(false)
  const [editing, setEditing] = useState<Card | null>(null)
  const shownAt = useRef(Date.now())
  const busy = useRef(false)

  const settings = data?.deck.settings
  const eligible = useMemo(() => studyStates(data, settings?.starredOnly), [data, settings?.starredOnly])
  // Cards added while editing come up right after the current one.
  const addCards = useAddedCards(data, (keys) =>
    setRound((r) => (r && !isRoundDone(r) ? { ...r, queue: [...r.queue.slice(0, r.pos + 1), ...keys, ...r.queue.slice(r.pos + 1)] } : r)),
  )

  const stateByKey = useMemo(() => new Map(data?.states.map((s) => [s.key, s]) ?? []), [data])
  const cardById = useMemo(() => new Map(data?.cards.map((c) => [c.id, c]) ?? []), [data])
  const orderOf = useMemo(() => {
    const m = new Map<string, number>()
    data?.cards.forEach((c, i) => m.set(c.id, i))
    return m
  }, [data])

  const itemFor = useCallback(
    (key: string): StudyItem | null => {
      const st = stateByKey.get(key)
      const card = st && cardById.get(st.card_id)
      return st && card && settings ? buildItem(card, st, settings.direction, String(roundNo)) : null
    },
    [stateByKey, cardById, settings, roundNo],
  )

  const begin = useCallback(
    (onlyKeys?: string[]) => {
      if (!data || !settings) return
      if (eligible.length === 0) return setPhase('empty')
      const allMastered = eligible.every((s) => s.status === 'mastered')
      if (!onlyKeys && allMastered && !settings.reviewMastered) return setPhase('complete')
      const keys =
        onlyKeys ??
        pickRound(
          eligible.map((s) => ({ key: s.key, status: s.status, order: (orderOf.get(s.card_id) ?? 0) * 100 + s.sub_index })),
          { size: settings.roundSize, shuffle: settings.shuffle, reviewMastered: settings.reviewMastered || allMastered },
        )
      setRound(startRound(keys))
      setRoundNo((n) => n + 1)
      setUndo([])
      setFlipped(false)
      setPhase('card')
      shownAt.current = Date.now()
    },
    [data, settings, eligible, orderOf],
  )

  // Start the first round once the deck has loaded, and again after a progress reset
  // (pendingRestart waits for the reset to show up in the live data).
  const started = useRef(false)
  const pendingRestart = useRef(false)
  useEffect(() => {
    if (data && (!started.current || pendingRestart.current)) {
      started.current = true
      pendingRestart.current = false
      begin()
    }
  }, [data, begin])

  // Changed options (round size, direction, starred only...) start a fresh round, unless on the summary.
  const settingsKey = JSON.stringify(settings ?? null)
  const lastSettings = useRef(settingsKey)
  useEffect(() => {
    if (lastSettings.current === settingsKey) return
    const first = lastSettings.current === 'null'
    lastSettings.current = settingsKey
    if (!first && started.current && phase !== 'summary') begin()
  }, [settingsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const key = round ? currentKey(round) : undefined
  const item = key ? itemFor(key) : null

  useEffect(() => {
    shownAt.current = Date.now()
    if (item && settings?.autoplayTts && phase === 'card') speak(item.promptText)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const flip = () => {
    setFlipped((f) => {
      if (!f && item && settings?.autoplayTts) speak(item.answerText)
      return !f
    })
  }

  /** Buttons and keys need the card flipped; a swipe answers straight away. */
  const rate = async (correct: boolean, swiped = false) => {
    if (!round || !key || (!flipped && !swiped) || busy.current || !settings) return
    const prev = stateByKey.get(key)
    if (!prev) return
    busy.current = true
    try {
      const next = applyRating(prev, correct, round.missed.includes(key), settings.correctToMaster)
      await db.cardStates.put({
        ...prev,
        ...next,
        reps: prev.reps + 1,
        lapses: prev.lapses + (correct ? 0 : 1),
        last_review: now(),
        updated_at: now(),
      })
      const logId = await logReview({
        card_id: prev.card_id,
        deck_id: prev.deck_id,
        sub_index: prev.sub_index,
        mode: 'learn',
        rating: correct ? 'got' : 'missed',
        duration_ms: Date.now() - shownAt.current,
      })
      const after = answerRound(round, correct)
      setUndo((u) => [...u, { round, prev, logId }])
      setRound(after)
      setFlipped(false)
      if (isRoundDone(after)) setPhase('summary')
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
    setRound(step.round)
    setPhase('card')
    setFlipped(true)
  }

  useKeys((e) => {
    if (editing || options) return
    if (e.key === 'Escape') return nav(backHref(id))
    if (phase === 'summary') {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        begin()
      }
      return
    }
    if (phase !== 'card') return
    if (isFlipKey(e)) {
      e.preventDefault()
      flip()
    } else if (e.key === '1') void rate(true)
    else if (e.key === '2') void rate(false)
    // Arrows answer like a swipe: no need to flip first.
    else if (e.key === 'ArrowRight') void rate(true, true)
    else if (e.key === 'ArrowLeft') void rate(false, true)
    else if (e.key.toLowerCase() === 'z') void undoLast()
  })

  if (data === undefined) return null
  if (data === null) return <Empty icon={<X size={40} />} title="Deck not found" />
  const { deck } = data

  const roundKeys = round ? [...new Set(round.queue)] : []
  const progress = round ? round.pos / Math.max(1, round.queue.length) : 0
  const allStatuses = eligible.map((s) => s.status)

  return (
    <StudyShell deck={deck} progress={phase === 'card' ? progress : phase === 'summary' ? 1 : null} onOptions={() => setOptions(true)}>
      {phase === 'card' && item && (
        <>
          <StudyCard
            item={item}
            flipped={flipped}
            onFlip={flip}
            onSwipe={(d) => rate(d === 'right', true)}
            onEdit={() => setEditing(item.card)}
            keys={!editing && !options}
            badge={<StatusBadge status={item.state.status} />}
            swipeLabels={{ left: "Didn't get it", right: 'Got it' }}
          />
          {settings?.typeAnswer && <TypeAnswer item={item} flipped={flipped} onSubmit={flip} />}
          {flipped ? (
            <div className="grade">
              <button onClick={() => rate(false)}>
                <span className="key">2</span>
                <span className="miss">Didn't get it</span>
              </button>
              <button onClick={() => rate(true)}>
                <span className="key">1</span>
                <span className="got">Got it</span>
              </button>
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
          <div className="kbd-hint">Space / Enter / ↑↓ flip · → or 1 got it · ← or 2 didn't get it · Z undo</div>
        </>
      )}

      {phase === 'summary' && round && (
        <div className="summary">
          <RoundSummary
            score={roundScore(round)}
            statuses={allStatuses}
            rows={roundKeys.map((k) => ({ key: k, item: itemFor(k), missed: round.missed.includes(k) }))}
          />
          <button className="btn btn-primary btn-lg btn-block" style={{ marginTop: 16 }} onClick={() => begin()} autoFocus>
            Continue
          </button>
          <div className="row" style={{ marginTop: 10, gap: 10 }}>
            {round.missed.length > 0 && (
              <button className="btn grow" onClick={() => begin(round.missed)}>
                Missed only ({round.missed.length})
              </button>
            )}
            <button className="btn grow" onClick={() => nav(backHref(id))}>
              Done
            </button>
          </div>
          {undo.length > 0 && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>
              <button className="btn btn-ghost small" onClick={undoLast}>
                <Undo2 size={16} /> Undo last answer
              </button>
            </div>
          )}
        </div>
      )}

      {phase === 'complete' && (
        <Empty icon={<PartyPopper size={44} />} title="Set mastered">
          <p>Every card is mastered. Restart from scratch, or review the mastered cards anyway.</p>
          <div className="row wrap" style={{ justifyContent: 'center', gap: 10, marginTop: 12 }}>
            <button
              className="btn btn-primary"
              onClick={async () => {
                pendingRestart.current = true
                await resetProgress(deck.id)
              }}
            >
              <RotateCcw size={18} /> Restart
            </button>
            <button
              className="btn"
              onClick={() =>
                begin(
                  pickRound(
                    eligible.map((s) => ({ key: s.key, status: s.status, order: orderOf.get(s.card_id) ?? 0 })),
                    { size: settings!.roundSize, shuffle: true, reviewMastered: true },
                  ),
                )
              }
            >
              Review anyway
            </button>
          </div>
        </Empty>
      )}

      {phase === 'empty' && (
        <Empty icon={<X size={40} />} title={settings?.starredOnly ? 'No starred cards' : 'No cards to study'}>
          {settings?.starredOnly ? <p>Turn off "Starred cards only" in Options.</p> : <p>Add some cards first.</p>}
        </Empty>
      )}

      {options && (
        <StudyOptions
          deck={deck}
          show={['direction', 'roundSize', 'correctToMaster', 'typeAnswer', 'starredOnly', 'shuffle', 'reviewMastered', 'autoplayTts']}
          onClose={() => setOptions(false)}
          onReset={() => (pendingRestart.current = true)}
        />
      )}
      {editing && <EditCardSheet card={editing} onClose={() => setEditing(null)} onAdded={addCards} />}
    </StudyShell>
  )
}

function RoundSummary({
  score,
  statuses,
  rows,
}: {
  score: { correct: number; total: number }
  statuses: CardState['status'][]
  rows: { key: string; item: StudyItem | null; missed: boolean }[]
}) {
  return (
    <>
      <div className="panel">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="grow">
            <div className="small muted">This round</div>
            <div className="score-big">
              {score.correct}/{score.total}
            </div>
            <div className="small muted">right on the first try</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="small muted">Set</div>
            <div className="score-big" style={{ fontSize: 30 }}>{masteryPercent(statuses)}%</div>
            <div className="small muted">mastered</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <MasteryBar statuses={statuses} />
        </div>
        <StatGrid statuses={statuses} />
      </div>
      <div className="section">
        <h3 className="section-title">Cards this round</h3>
        <div className="list">
          {rows.map(({ key, item, missed }) =>
            item ? (
              <div className="list-item" key={key} style={{ alignItems: 'flex-start' }}>
                <span style={{ color: missed ? 'var(--st-learning)' : 'var(--st-mastered)', paddingTop: 2 }} aria-label={missed ? 'Missed' : 'Got it'}>
                  {missed ? <X size={18} /> : <Check size={18} />}
                </span>
                <div className="grow">
                  <div className="rich small muted" dangerouslySetInnerHTML={{ __html: item.prompt }} />
                  <div className="rich" style={{ fontWeight: 600, marginTop: 2 }} dangerouslySetInnerHTML={{ __html: item.answer }} />
                </div>
                <StatusBadge status={item.state.status} />
              </div>
            ) : null,
          )}
        </div>
      </div>
    </>
  )
}
