import { CalendarClock, ChevronDown, ChevronRight, Folder, FolderPlus, Layers, Merge, Plus, Search, Settings as SettingsIcon, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DeckMenu } from '../components/DeckMenu'
import { DeckRow } from '../components/DeckRow'
import { Empty, ICON, Sheet, useToast } from '../components/ui'
import { alive, copyIntoNewDeck, createDeck, createFolder, deleteFolder, htmlToText } from '../lib/db'
import { useDecks, useFolders, useKeys } from '../lib/hooks'
import { dueCounts } from '../lib/srs'
import type { Deck } from '../lib/types'

export function Home() {
  const data = useDecks()
  const folders = useFolders() ?? []
  const nav = useNavigate()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [menuDeck, setMenuDeck] = useState<Deck | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [folderSheet, setFolderSheet] = useState(false)
  const [folderName, setFolderName] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const decks = useMemo(
    () => (data?.decks ?? []).filter(alive).sort((a, b) => (b.last_studied_at ?? b.updated_at).localeCompare(a.last_studied_at ?? a.updated_at)),
    [data],
  )

  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term || !data) return null
    const deckHits = decks.filter((d) => d.title.toLowerCase().includes(term) || d.tags.some((t) => t.toLowerCase().includes(term)))
    const live = new Set(decks.map((d) => d.id))
    const cardHits = data.cards
      .filter((c) => live.has(c.deck_id))
      .map((c) => ({ c, front: htmlToText(c.front), back: htmlToText(c.back) }))
      .filter(({ front, back }) => front.toLowerCase().includes(term) || back.toLowerCase().includes(term))
      .slice(0, 50)
    return { deckHits, cardHits }
  }, [q, data, decks])

  const newDeck = async () => {
    const d = await createDeck()
    nav(`/deck/${d.id}/edit`)
  }

  useKeys((e) => {
    if (menuDeck || folderSheet) return
    if (e.key === '/') {
      e.preventDefault()
      searchRef.current?.focus()
    } else if (e.key.toLowerCase() === 'n') void newDeck()
  })

  if (!data) return null

  const t = Date.now()
  const dueOf = (d: Deck) => dueCounts(data.byDeck.get(d.id) ?? [], d.settings.newPerDay, t).dueNow
  const row = (d: Deck) => (
    <DeckRow
      key={d.id}
      deck={d}
      due={dueOf(d)}
      count={data.counts.get(d.id) ?? 0}
      states={data.byDeck.get(d.id) ?? []}
      onMenu={() => setMenuDeck(d)}
      selecting={selecting}
      selected={selected.includes(d.id)}
      onToggle={() => setSelected((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id]))}
    />
  )

  const pinned = decks.filter((d) => d.pinned)
  const dueDecks = decks.filter((d) => dueOf(d) > 0)
  const recent = decks.filter((d) => d.last_studied_at).slice(0, 3)
  const loose = decks.filter((d) => !d.folder_id || !folders.some((f) => f.id === d.folder_id))

  return (
    <div className="page wide">
      <div className="topbar">
        <h1 className="truncate">{selecting ? `${selected.length} selected` : 'Flashcards'}</h1>
        {selecting ? (
          <>
            <button
              className="btn btn-primary"
              disabled={selected.length < 2}
              onClick={async () => {
                const titles = selected.map((id) => decks.find((d) => d.id === id)?.title ?? '').join(' + ')
                const d = await copyIntoNewDeck(selected, titles)
                setSelecting(false)
                setSelected([])
                nav(`/deck/${d.id}`)
              }}
            >
              <Merge size={18} /> Combine
            </button>
            <button className="icon-btn" aria-label="Cancel selection" onClick={() => (setSelecting(false), setSelected([]))}>
              <X size={ICON} />
            </button>
          </>
        ) : (
          <>
            {decks.length > 1 && (
              <button className="icon-btn" aria-label="Select decks to combine" title="Combine decks" onClick={() => setSelecting(true)}>
                <Merge size={ICON} />
              </button>
            )}
            <button className="icon-btn" aria-label="New folder" title="New folder" onClick={() => setFolderSheet(true)}>
              <FolderPlus size={ICON} />
            </button>
            <Link className="icon-btn" aria-label="Settings" title="Settings and sync" to="/settings">
              <SettingsIcon size={ICON} />
            </Link>
            <button className="btn btn-primary" onClick={newDeck} aria-label="New deck">
              <Plus size={18} />
              <span className="wide-only">New deck</span>
            </button>
          </>
        )}
      </div>

      {decks.length > 0 && (
        <div className="search">
          <Search size={18} />
          <input ref={searchRef} className="input" type="search" placeholder="Search decks and cards" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        </div>
      )}

      {results ? (
        <>
          <div className="section">
            <h3 className="section-title">Decks</h3>
            {results.deckHits.length ? <div className="list">{results.deckHits.map(row)}</div> : <div className="muted small">No matching decks</div>}
          </div>
          <div className="section">
            <h3 className="section-title">Cards</h3>
            {results.cardHits.length ? (
              <div className="list">
                {results.cardHits.map(({ c, front, back }) => (
                  <Link key={c.id} className="list-item" to={`/deck/${c.deck_id}`}>
                    <div className="grow">
                      <div style={{ fontWeight: 600 }} className="truncate">{front || '(empty)'}</div>
                      <div className="small muted truncate">{back}</div>
                      <div className="small muted">{decks.find((d) => d.id === c.deck_id)?.title}</div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="muted small">No matching cards</div>
            )}
          </div>
        </>
      ) : decks.length === 0 ? (
        <Empty icon={<Layers size={40} />} title="No decks yet">
          <p>Make a deck from scratch, or paste in cards with Import in the editor.</p>
          <div className="row wrap" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={newDeck}>
              <Plus size={18} /> New deck
            </button>
          </div>
        </Empty>
      ) : (
        <>
          {dueDecks.length > 0 && !selecting && (
            <div className="section">
              <h3 className="section-title">Due today</h3>
              <div className="list">
                {dueDecks.map((d) => (
                  <Link key={d.id} className="list-item" to={`/deck/${d.id}/spaced`}>
                    <CalendarClock size={ICON} style={{ color: 'var(--st-learning)' }} />
                    <span className="grow truncate" style={{ fontWeight: 600 }}>{d.title || 'Untitled deck'}</span>
                    <span className="count-pill">{dueOf(d)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {pinned.length > 0 && (
            <div className="section">
              <h3 className="section-title">Pinned</h3>
              <div className="list">{pinned.map(row)}</div>
            </div>
          )}
          {recent.length > 0 && decks.length > 4 && !selecting && (
            <div className="section">
              <h3 className="section-title">Recently studied</h3>
              <div className="list">{recent.map(row)}</div>
            </div>
          )}
          {folders.map((f) => {
            const inFolder = decks.filter((d) => d.folder_id === f.id)
            const open = !collapsed[f.id]
            return (
              <div className="section" key={f.id}>
                <div className="row">
                  <button
                    className="section-title btn-ghost"
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
                    onClick={() => setCollapsed((c) => ({ ...c, [f.id]: open }))}
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <Folder size={16} /> {f.name} · {inFolder.length}
                  </button>
                  <span className="spacer grow" />
                  {inFolder.length === 0 && (
                    <button className="btn btn-ghost small" onClick={() => deleteFolder(f.id)}>
                      Delete folder
                    </button>
                  )}
                </div>
                {open && (inFolder.length ? <div className="list">{inFolder.map(row)}</div> : <div className="small muted">Empty. Move a deck here from its menu.</div>)}
              </div>
            )
          })}
          {loose.length > 0 && (
            <div className="section">
              <h3 className="section-title">{folders.length ? 'Other decks' : 'All decks'}</h3>
              <div className="list">{loose.map(row)}</div>
            </div>
          )}
        </>
      )}

      {menuDeck && (
        <DeckMenu
          deck={menuDeck}
          onClose={() => setMenuDeck(null)}
          onDone={(msg, undo) => toast.show({ msg, action: undo ? { label: 'Undo', run: undo } : undefined })}
        />
      )}
      {folderSheet && (
        <Sheet title="New folder" onClose={() => setFolderSheet(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (!folderName.trim()) return
              await createFolder(folderName.trim())
              setFolderName('')
              setFolderSheet(false)
            }}
          >
            <input className="input" autoFocus placeholder="e.g. Fall 2026" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
            <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} type="submit">
              Create folder
            </button>
          </form>
        </Sheet>
      )}
      {toast.node}
    </div>
  )
}
