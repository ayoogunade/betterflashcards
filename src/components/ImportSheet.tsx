import { useMemo, useState } from 'react'
import { htmlToText, importCards } from '../lib/db'
import { parseImport, textToHtml, type RowSeparator, type TermSeparator } from '../lib/importParser'
import type { Card } from '../lib/types'
import { Seg, Setting, Sheet, Switch } from './ui'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export function ImportSheet({ deckId, existing, onClose, onDone }: { deckId: string; existing: Card[]; onClose: () => void; onDone: (n: number) => void }) {
  const hasCards = existing.some((c) => htmlToText(c.front) || htmlToText(c.back))
  const [skipDupes, setSkipDupes] = useState(true)
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

  /** Rows whose term is already in the deck, or repeats an earlier row in this paste. */
  const dupes = useMemo(() => {
    const seen = new Set(existing.map((c) => norm(htmlToText(c.front))).filter(Boolean))
    const out = new Set<number>()
    parsed.forEach((p, i) => {
      const key = norm(htmlToText(textToHtml(p.front)))
      if (!key) return
      if (seen.has(key)) out.add(i)
      seen.add(key)
    })
    return out
  }, [parsed, existing])
  const toImport = skipDupes ? parsed.filter((_, i) => !dupes.has(i)) : parsed

  const run = async (replace: boolean) => {
    // Replacing removes the old cards, so only repeats within the paste count as duplicates then.
    const rows = replace ? parsed.filter((p, i) => !skipDupes || parsed.findIndex((q) => norm(q.front) === norm(p.front)) === i) : toImport
    if (replace && !confirm(`Replace all cards in this deck with ${rows.length} imported cards? Progress on the old cards is lost.`)) return
    setBusy(true)
    await importCards(deckId, rows, replace)
    onDone(rows.length)
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
        {dupes.size > 0 && <span style={{ color: 'var(--st-learning)' }}> · {dupes.size} already in this deck or repeated</span>}
      </div>
      {dupes.size > 0 && (
        <Setting title="Skip duplicates" desc="Matched by term, ignoring case and spacing">
          <Switch label="Skip duplicates" on={skipDupes} onChange={setSkipDupes} />
        </Setting>
      )}
      {parsed.length > 0 && (
        <div className="list" style={{ maxHeight: 220, overflowY: 'auto', boxShadow: 'none', border: '1px solid var(--line)' }}>
          {parsed.slice(0, 100).map((p, i) => (
            <div key={i} className="list-item small" style={{ alignItems: 'flex-start', opacity: skipDupes && dupes.has(i) ? 0.45 : 1 }}>
              <span className="muted" style={{ width: 24 }}>{i + 1}</span>
              <div className="sides grow" style={{ gap: 4 }}>
                <div style={{ fontWeight: 600, whiteSpace: 'pre-wrap' }}>
                  {p.front.replace(/<br>/g, '\n')}
                  {dupes.has(i) && <span className="badge badge-learning" style={{ marginLeft: 6 }}>Duplicate</span>}
                </div>
                <div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{p.back.replace(/<br>/g, '\n') || (p.type === 'cloze' ? '' : '(no definition)')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary grow" disabled={!toImport.length || busy} onClick={() => run(false)}>
          {hasCards ? `Add ${toImport.length} to bottom` : `Import ${toImport.length} cards`}
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
