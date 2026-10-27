import { hasCloze } from './cloze'

export type TermSeparator = 'tab' | 'comma' | 'custom'
export type RowSeparator = 'newline' | 'semicolon' | 'custom'

export interface ImportOptions {
  termSep: TermSeparator
  rowSep: RowSeparator
  customTermSep?: string
  customRowSep?: string
}

export interface ParsedCard {
  type: 'basic' | 'cloze'
  front: string
  back: string
}

/** Turns `\n`, `\t` typed literally in a custom separator box into the real characters. */
function unescape(sep: string): string {
  return sep.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
}

function resolve(opts: ImportOptions): { term: string; row: string } {
  const term =
    opts.termSep === 'tab' ? '\t' : opts.termSep === 'comma' ? ',' : unescape(opts.customTermSep ?? '')
  const row =
    opts.rowSep === 'newline' ? '\n' : opts.rowSep === 'semicolon' ? ';' : unescape(opts.customRowSep ?? '')
  return { term, row }
}

/**
 * Parse pasted text into cards. A row containing `{{...}}` becomes a cloze card (the whole row
 * before the term separator is the cloze text; anything after it is extra info). Rows with no
 * term separator become basic cards with an empty back, so nothing pasted is silently dropped.
 */
export function parseImport(text: string, opts: ImportOptions): ParsedCard[] {
  const { term, row } = resolve(opts)
  if (!row) return []
  const rows = text.replace(/\r\n?/g, '\n').split(row)
  const cards: ParsedCard[] = []
  for (const raw of rows) {
    if (!raw.trim()) continue
    const idx = term ? raw.indexOf(term) : -1
    const front = (idx >= 0 ? raw.slice(0, idx) : raw).trim()
    const back = (idx >= 0 ? raw.slice(idx + term.length) : '').trim()
    if (!front && !back) continue
    cards.push({ type: hasCloze(front) ? 'cloze' : 'basic', front, back })
  }
  return cards
}

/** Escape plain text for storage as editor HTML, keeping line breaks. */
export function textToHtml(text: string): string {
  const esc = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<p>${esc.replace(/\n/g, '<br>')}</p>`
}
