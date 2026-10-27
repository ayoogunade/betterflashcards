import { useMemo, useState } from 'react'
import { importCards } from '../lib/db'
import { parseImport, type RowSeparator, type TermSeparator } from '../lib/importParser'
import { Seg, Sheet } from './ui'

export function ImportSheet({ deckId, hasCards, onClose, onDone }: { deckId: string; hasCards: boolean; onClose: () => void; onDone: (n: number) => void }) {
  const [text, setText] = useState('')
  const [termSep, setTermSep] = useState<TermSeparator>('tab')
  const [rowSep, setRowSep] = useState<RowSeparator>('newline')
  const [customTerm, setCustomTerm] = useState(' - ')
  const [customRow, setCustomRow] = useState('\\n\\n')
  const [busy, setBusy] = useState(false)

  const parsed = useMemo(
    () => parseImport(text, { termSep, rowSep, customTermSep: customTerm, customRowSep: customRow }),
    [text, termSep, rowSep, customTerm, customRow],
  )
  const clozes = parsed.filter((p) => p.type === 'cloze').length

  const run = async (replace: boolean) => {
    if (replace && !confirm(`Replace all cards in this deck with ${parsed.length} imported cards? Progress on the old cards is lost.`)) return
    setBusy(true)
    await importCards(deckId, parsed, replace)
    onDone(parsed.length)
  }

  return (
    <Sheet title="Import cards" onClose={onClose}>
      <p className="small muted" style={{ marginTop: 0 }}>
        Paste rows of <b>term</b> then <b>definition</b>. A row with <code>{'{{...}}'}</code> becomes a fill-in-the-blank card.
      </p>
      <div className="row wrap" style={{ gap: 12, marginBottom: 12 }}>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Between term and definition</div>
          <Seg<TermSeparator>
            value={termSep}
            onChange={setTermSep}
            options={[
              { value: 'tab', label: 'Tab' },
              { value: 'comma', label: 'Comma' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {termSep === 'custom' && (
            <input className="input" style={{ marginTop: 6, width: 140 }} value={customTerm} onChange={(e) => setCustomTerm(e.target.value)} aria-label="Custom term separator" />
          )}
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 4 }}>Between rows</div>
          <Seg<RowSeparator>
            value={rowSep}
            onChange={setRowSep}
            options={[
              { value: 'newline', label: 'New line' },
              { value: 'semicolon', label: 'Semicolon' },
              { value: 'custom', label: 'Custom' },
            ]}
          />
          {rowSep === 'custom' && (
            <input className="input" style={{ marginTop: 6, width: 140 }} value={customRow} onChange={(e) => setCustomRow(e.target.value)} aria-label="Custom row separator" />
          )}
        </div>
      </div>
      <textarea
        className="textarea"
        autoFocus
        placeholder={'Signed\tIntegers that can be positive or negative\n{{Deadlock}} is when processes wait on each other forever'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Text to import"
      />
      <div className="small muted" style={{ margin: '10px 0 6px' }}>
        {parsed.length} cards{clozes ? ` (${clozes} fill in the blank)` : ''}
      </div>
      {parsed.length > 0 && (
        <div className="list" style={{ maxHeight: 220, overflowY: 'auto', boxShadow: 'none', border: '1px solid var(--line)' }}>
          {parsed.slice(0, 100).map((p, i) => (
            <div key={i} className="list-item small" style={{ alignItems: 'flex-start' }}>
              <span className="muted" style={{ width: 24 }}>{i + 1}</span>
              <div className="sides grow" style={{ gap: 4 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>{p.front.replace(/<br>/g, '\n')}</div>
                <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{p.back.replace(/<br>/g, '\n') || (p.type === 'cloze' ? '' : '(no definition)')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary grow" disabled={!parsed.length || busy} onClick={() => run(false)}>
          {hasCards ? 'Add to bottom' : `Import ${parsed.length} cards`}
        </button>
        {hasCards && (
          <button className="btn btn-danger" disabled={!parsed.length || busy} onClick={() => run(true)}>
            Replace all
          </button>
        )}
      </div>
    </Sheet>
  )
}
