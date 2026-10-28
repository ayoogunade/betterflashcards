import { ArrowLeft, Brain, CalendarClock, Copy, GraduationCap, MoreHorizontal, Pause, Pencil, Play, Plus, Star, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditCardSheet } from '../components/LazyEditCardSheet'
import { DeckMenu } from '../components/DeckMenu'
import { Heatmap, useActivity } from '../components/Heatmap'
import { Empty, ICON, MasteryBar, StatGrid, StatusBadge, useToast } from '../components/ui'
import { addCard, isBlankCard, updateCard } from '../lib/db'
import { studyStates, useDeck, useKeys } from '../lib/hooks'
import { LEECH_AT, isLeech, masteryPercent } from '../lib/learn'
import { dueCounts, examCutoff } from '../lib/srs'
import { highlightClozeSource, renderMath } from '../lib/render'
import type { Card, Status } from '../lib/types'

export function DeckPage() {
  const { id } = useParams()
  const data = useDeck(id)
  const activity = useActivity(id)
  const nav = useNavigate()
  const toast = useToast()
  const [menu, setMenu] = useState(false)
  const [editing, setEditing] = useState<{ card: Card; fresh?: boolean } | null>(null)
  const [filter, setFilter] = useState<Status | 'starred' | 'leech' | 'suspended' | null>(null)

  /** Quick add: a blank card in a sheet, without opening the full editor. Left blank, it's removed on close. */
  const quickAdd = async () => {
    if (data) setEditing({ card: await addCard(data.deck.id, { type: 'basic', front: '', back: '' }), fresh: true })
  }

  useKeys((e) => {
    if (menu || editing || !data) return
    if (e.key.toLowerCase() === 'a') return void quickAdd()
    const go = { l: 'learn', f: 'flashcards', s: 'spaced', e: 'edit' }[e.key.toLowerCase()]
    if (go && data.cards.length) nav(`/deck/${data.deck.id}/${go}`)
    else if (e.key === 'Escape') nav('/')
  })

  if (data === undefined) return null
  if (data === null)
    return (
      <div className="page">
        <Empty icon={<Copy size={40} />} title="Deck not found">
          <Link className="btn" to="/">
            Back to library
          </Link>
        </Empty>
      </div>
    )

  const { deck, states } = data
  // Empty cards (an unfinished quick add) are cleaned up when the editor closes; never list them.
  const cards = data.cards.filter((c) => !isBlankCard(c))
  const statuses = states.map((s) => s.status)
  const due = dueCounts(studyStates(data, false), deck.settings.newPerDay, Date.now())
  const exam = examCutoff(deck.settings.examDate)
  const examDays = exam === null ? null : Math.ceil((exam + 86_400_000 - Date.now()) / 86_400_000)
  const suspended = cards.filter((c) => c.suspended).length
  const statesByCard = new Map<string, Status[]>()
  for (const s of states) statesByCard.set(s.card_id, [...(statesByCard.get(s.card_id) ?? []), s.status])
  const leeches = new Set(states.filter(isLeech).map((s) => s.card_id))
  const shown = cards.filter((c) =>
    !filter
      ? true
      : filter === 'starred'
        ? c.starred
        : filter === 'leech'
          ? leeches.has(c.id)
          : filter === 'suspended'
            ? c.suspended
            : (statesByCard.get(c.id) ?? []).includes(filter),
  )

  return (
    <div className="page wide">
      <div className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back to library">
          <ArrowLeft size={ICON} />
        </Link>
        <h1 className="truncate">{deck.title || 'Untitled deck'}</h1>
        <Link to={`/deck/${deck.id}/edit`} className="btn">
          <Pencil size={16} /> Edit
        </Link>
        <button className="icon-btn" aria-label="Deck actions" onClick={() => setMenu(true)}>
          <MoreHorizontal size={ICON} />
        </button>
      </div>

      {deck.description && (
        <p className="muted" style={{ marginTop: 0 }}>
          {deck.description}
        </p>
      )}
      {deck.tags.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 12 }}>
          {deck.tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <Empty icon={<Copy size={40} />} title="No cards yet">
          <Link className="btn btn-primary" to={`/deck/${deck.id}/edit`}>
            Add cards
          </Link>
        </Empty>
      ) : (
        <div className="deck-layout">
          <aside>
            <div className="panel">
              <div className="row">
                <div className="grow">
                  <div className="score-big" style={{ fontSize: 34 }}>
                    {masteryPercent(statuses)}%
                  </div>
                  <div className="small muted">mastered · {cards.length} cards</div>
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <MasteryBar statuses={statuses} />
              </div>
              <StatGrid statuses={statuses} active={filter === 'starred' || filter === 'leech' || filter === 'suspended' ? null : filter} onPick={(s) => setFilter(s)} />
              <div className="row small muted" style={{ marginTop: 10, gap: 14 }}>
                <span>
                  <b style={{ color: 'var(--ink)' }}>{due.today}</b> due today
                </span>
                <span>
                  <b style={{ color: 'var(--ink)' }}>{due.thisWeek}</b> this week
                </span>
                <span>
                  <b style={{ color: 'var(--ink)' }}>{due.newToday}</b> new today
                </span>
                {examDays !== null && examDays >= 0 && (
                  <span title="Set in Spaced review options">
                    <GraduationCap size={14} style={{ verticalAlign: -2 }} /> <b style={{ color: 'var(--ink)' }}>{examDays}</b> {examDays === 1 ? 'day' : 'days'} to exam
                  </span>
                )}
              </div>
            </div>

            <div className="row" style={{ marginTop: 14, gap: 10 }}>
              <button className="btn btn-primary btn-lg grow" onClick={() => nav(`/deck/${deck.id}/learn`)}>
                <Brain size={20} /> Learn
              </button>
              <button className="btn btn-lg grow" onClick={() => nav(`/deck/${deck.id}/flashcards`)}>
                <Copy size={20} /> Flashcards
              </button>
            </div>
            <button className="btn btn-lg btn-block" style={{ marginTop: 10 }} onClick={() => nav(`/deck/${deck.id}/spaced`)}>
              <CalendarClock size={20} /> Spaced review
              {due.dueNow + due.newToday > 0 && <span className="count-pill">{due.dueNow + due.newToday}</span>}
            </button>
            {activity && activity.size > 0 && (
              <div className="panel" style={{ marginTop: 14 }}>
                <Heatmap byDay={activity} />
              </div>
            )}
          </aside>

          <div className="section">
            <div className="row" style={{ marginBottom: 8 }}>
              <h3 className="section-title grow" style={{ margin: 0 }}>
                {filter ? `${shown.length} ${['starred', 'leech', 'suspended'].includes(filter) ? `${filter} ` : ''}cards` : `${cards.length} cards`}
              </h3>
              {leeches.size > 0 && (
                <button
                  className={`btn btn-ghost small ${filter === 'leech' ? 'on' : ''}`}
                  onClick={() => setFilter(filter === 'leech' ? null : 'leech')}
                  aria-pressed={filter === 'leech'}
                  title={`Missed ${LEECH_AT}+ times: worth rewriting or splitting`}
                >
                  <TriangleAlert size={16} /> Leeches {leeches.size}
                </button>
              )}
              {suspended > 0 && (
                <button
                  className={`btn btn-ghost small ${filter === 'suspended' ? 'on' : ''}`}
                  onClick={() => setFilter(filter === 'suspended' ? null : 'suspended')}
                  aria-pressed={filter === 'suspended'}
                  title="Left out of study"
                >
                  <Pause size={16} /> Suspended {suspended}
                </button>
              )}
              <button
                className={`btn btn-ghost small ${filter === 'starred' ? 'on' : ''}`}
                onClick={() => setFilter(filter === 'starred' ? null : 'starred')}
                aria-pressed={filter === 'starred'}
              >
                <Star size={16} fill={filter === 'starred' ? 'currentColor' : 'none'} /> Starred
              </button>
              {filter && (
                <button className="btn btn-ghost small" onClick={() => setFilter(null)}>
                  Show all
                </button>
              )}
              <button className="icon-btn sm bordered" aria-label="Add a card" title="Add a card (A)" onClick={quickAdd}>
                <Plus size={18} />
              </button>
            </div>
            <div className="list">
              {shown.map((c) => (
                <div className="list-item" key={c.id} style={{ alignItems: 'flex-start' }}>
                  <button
                    className="grow"
                    style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left' }}
                    onClick={() => setEditing({ card: c })}
                    aria-label="Edit card"
                  >
                    {c.type === 'cloze' ? (
                      <div className="rich" dangerouslySetInnerHTML={{ __html: renderMath(highlightClozeSource(c.front)) }} />
                    ) : (
                      <div className="sides" style={{ gap: 4 }}>
                        <div
                          className="rich"
                          style={{ fontWeight: 600 }}
                          dangerouslySetInnerHTML={{ __html: renderMath(c.front) || '<span class="muted">(no term)</span>' }}
                        />
                        <div className="rich muted" dangerouslySetInnerHTML={{ __html: renderMath(c.back) || '(no definition)' }} />
                      </div>
                    )}
                    <div className="row wrap" style={{ marginTop: 6, gap: 4 }}>
                      {(statesByCard.get(c.id) ?? []).map((s, i) => (
                        <StatusBadge key={i} status={s} />
                      ))}
                      {leeches.has(c.id) && <span className="badge badge-leech">Leech</span>}
                      {c.suspended && <span className="badge">Suspended</span>}
                    </div>
                  </button>
                  {(c.suspended || leeches.has(c.id)) && (
                    <button
                      className="icon-btn sm"
                      aria-label={c.suspended ? 'Unsuspend card' : 'Suspend card'}
                      title={c.suspended ? 'Unsuspend: study it again' : 'Suspend: leave it out of study'}
                      onClick={() => updateCard(c.id, { suspended: !c.suspended })}
                    >
                      {c.suspended ? <Play size={18} /> : <Pause size={18} />}
                    </button>
                  )}
                  <button
                    className={`icon-btn sm ${c.starred ? 'star-on' : ''}`}
                    aria-label={c.starred ? 'Unstar card' : 'Star card'}
                    onClick={() => updateCard(c.id, { starred: !c.starred })}
                  >
                    <Star size={18} fill={c.starred ? 'currentColor' : 'none'} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {menu && (
        <DeckMenu
          deck={deck}
          onClose={() => setMenu(false)}
          onDone={(msg, undo) => {
            if (msg === 'Moved to Trash') nav('/')
            else toast.show({ msg, action: undo ? { label: 'Undo', run: undo } : undefined })
          }}
        />
      )}
      {editing && <EditCardSheet card={editing.card} fresh={editing.fresh} onClose={() => setEditing(null)} />}
      {toast.node}
    </div>
  )
}
