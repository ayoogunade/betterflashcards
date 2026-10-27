import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Heatmap, useActivity } from '../components/Heatmap'
import { ICON, MasteryBar, StatGrid } from '../components/ui'
import { alive } from '../lib/db'
import { useDecks } from '../lib/hooks'
import { masteryPercent } from '../lib/learn'
import { dueCounts } from '../lib/srs'

/** Activity across every deck: heatmap, streak, status totals, and each deck's mastery and due counts. */
export function Stats() {
  const data = useDecks()
  const byDay = useActivity()
  if (!data || !byDay) return null

  const decks = data.decks.filter(alive).sort((a, b) => a.title.localeCompare(b.title))
  const all = decks.flatMap((d) => data.byDeck.get(d.id) ?? [])
  const statuses = all.map((s) => s.status)
  const t = Date.now()

  return (
    <div className="page">
      <div className="topbar">
        <Link to="/settings" className="icon-btn" aria-label="Back to settings">
          <ArrowLeft size={ICON} />
        </Link>
        <h1>Stats</h1>
      </div>

      <div className="panel">
        <h3 className="section-title" style={{ marginTop: 0 }}>Reviews</h3>
        <Heatmap byDay={byDay} />
      </div>

      <div className="section">
        <h3 className="section-title">All decks · {masteryPercent(statuses)}% mastered</h3>
        <div className="panel">
          <MasteryBar statuses={statuses} />
          <StatGrid statuses={statuses} />
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">By deck</h3>
        <div className="list">
          {decks.map((d) => {
            const states = data.byDeck.get(d.id) ?? []
            const due = dueCounts(states, d.settings.newPerDay, t)
            return (
              <Link key={d.id} to={`/deck/${d.id}`} className="list-item" style={{ display: 'block' }}>
                <div className="row">
                  <span className="grow truncate" style={{ fontWeight: 600 }}>{d.title || 'Untitled deck'}</span>
                  <span className="small muted">{masteryPercent(states.map((s) => s.status))}%</span>
                </div>
                <div style={{ margin: '6px 0' }}>
                  <MasteryBar statuses={states.map((s) => s.status)} />
                </div>
                <div className="row small muted" style={{ gap: 12 }}>
                  <span>{data.counts.get(d.id) ?? 0} cards</span>
                  <span>{due.today} due today</span>
                  <span>{due.thisWeek} this week</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
