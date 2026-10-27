import { Copy, FileDown, Folder, FolderPlus, Pin, PinOff, RotateCcw, Tag, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { downloadFile } from '../lib/backup'
import { copyIntoNewDeck, createFolder, deckCards, resetProgress, trashDeck, updateDeck } from '../lib/db'
import { exportTsv } from '../lib/importParser'
import { useFolders } from '../lib/hooks'
import type { Deck } from '../lib/types'
import { ICON, Sheet } from './ui'

type View = 'menu' | 'move' | 'tags'

/** Every per-deck action lives here so the library and the deck page share one menu. */
export function DeckMenu({ deck, onClose, onDone }: { deck: Deck; onClose: () => void; onDone?: (msg: string, undo?: () => void) => void }) {
  const [view, setView] = useState<View>('menu')
  const [tags, setTags] = useState(deck.tags.join(', '))
  const [newFolder, setNewFolder] = useState('')
  const folders = useFolders() ?? []
  const nav = useNavigate()
  const done = (msg: string, undo?: () => void) => {
    onDone?.(msg, undo)
    onClose()
  }

  if (view === 'move')
    return (
      <Sheet title="Move to folder" onClose={onClose}>
        <div className="menu">
          <button onClick={() => updateDeck(deck.id, { folder_id: null }).then(() => done('Moved out of folder'))}>
            <Folder size={ICON} /> No folder {!deck.folder_id && <span className="chip">current</span>}
          </button>
          {folders.map((f) => (
            <button key={f.id} onClick={() => updateDeck(deck.id, { folder_id: f.id }).then(() => done(`Moved to ${f.name}`))}>
              <Folder size={ICON} /> {f.name} {deck.folder_id === f.id && <span className="chip">current</span>}
            </button>
          ))}
        </div>
        <form
          className="row"
          style={{ marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newFolder.trim()) return
            const f = await createFolder(newFolder.trim())
            await updateDeck(deck.id, { folder_id: f.id })
            done(`Moved to ${f.name}`)
          }}
        >
          <input className="input grow" placeholder="New folder name" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
          <button className="btn" type="submit" aria-label="Create folder">
            <FolderPlus size={ICON} />
          </button>
        </form>
      </Sheet>
    )

  if (view === 'tags')
    return (
      <Sheet title="Tags" onClose={onClose}>
        <label className="field">
          <span>Comma separated</span>
          <input className="input" autoFocus value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. biol2, final" />
        </label>
        <button
          className="btn btn-primary btn-block"
          onClick={() =>
            updateDeck(deck.id, { tags: [...new Set(tags.split(',').map((t) => t.trim()).filter(Boolean))] }).then(() => done('Tags saved'))
          }
        >
          Save
        </button>
      </Sheet>
    )

  return (
    <Sheet title={deck.title || 'Untitled deck'} onClose={onClose}>
      <div className="menu">
        <button onClick={() => updateDeck(deck.id, { pinned: !deck.pinned }).then(() => done(deck.pinned ? 'Unpinned' : 'Pinned'))}>
          {deck.pinned ? <PinOff size={ICON} /> : <Pin size={ICON} />} {deck.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button onClick={() => setView('move')}>
          <Folder size={ICON} /> Move to folder
        </button>
        <button onClick={() => setView('tags')}>
          <Tag size={ICON} /> Edit tags
        </button>
        <button
          onClick={async () => {
            const copy = await copyIntoNewDeck([deck.id], `${deck.title} (copy)`)
            onClose()
            nav(`/deck/${copy.id}`)
          }}
        >
          <Copy size={ICON} /> Duplicate
        </button>
        <button
          onClick={async () => {
            const name = (deck.title || 'deck').replace(/[^\w\- ]+/g, '').trim() || 'deck'
            downloadFile(`${name}.txt`, exportTsv(await deckCards(deck.id)), 'text/tab-separated-values')
            done('Exported for Anki or Quizlet')
          }}
        >
          <FileDown size={ICON} /> Export for Anki / Quizlet
        </button>
        <button
          onClick={async () => {
            if (confirm('Reset all progress for this deck? Every card goes back to New.')) {
              await resetProgress(deck.id)
              done('Progress reset')
            }
          }}
        >
          <RotateCcw size={ICON} /> Reset progress
        </button>
        <button
          className="btn-danger"
          onClick={async () => {
            await trashDeck(deck.id)
            done('Moved to Trash', () => updateDeck(deck.id, { deleted_at: null }))
          }}
        >
          <Trash2 size={ICON} /> Move to Trash
        </button>
      </div>
    </Sheet>
  )
}
