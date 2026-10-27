import katex from 'katex'
import { renderCloze } from './cloze'
import { htmlToText } from './db'
import type { Card, CardState, Direction } from './types'

/** Render `$$...$$` and `$...$` with KaTeX. A single `$` needs non-space next to it, so "$5 and $10" is left alone. */
export function renderMath(html: string): string {
  if (!html.includes('$')) return html
  const tex = (src: string, display: boolean) => {
    try {
      return katex.renderToString(decode(src), { displayMode: display, throwOnError: false })
    } catch {
      return src
    }
  }
  return html
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, s: string) => tex(s, true))
    .replace(/\$(?=\S)([^$<]+?)(?<=\S)\$/g, (_m, s: string) => tex(s, false))
}

function decode(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<br\s*\/?>/gi, ' ')
}

/** Show cloze source with its braces highlighted (editor previews and lists). */
export function highlightClozeSource(html: string): string {
  return html.replace(/\{\{(?:c\d+::)?([\s\S]*?)\}\}/g, '<span class="cloze-src">$1</span>')
}

export interface StudyItem {
  key: string
  card: Card
  state: CardState
  /** HTML shown before flipping. */
  prompt: string
  /** HTML shown after flipping. */
  answer: string
  /** Plain text of the answer, for the auto hint and speech. */
  answerText: string
  promptText: string
  promptLabel: string
  answerLabel: string
}

/** Stable per-round pseudo-random choice for mixed direction. */
function coin(seed: string): boolean {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return (h & 1) === 0
}

export function buildItem(card: Card, state: CardState, direction: Direction, seed = ''): StudyItem {
  if (card.type === 'cloze') {
    const prompt = renderMath(renderCloze(card.front, state.sub_index, false))
    const filled = renderMath(renderCloze(card.front, state.sub_index, true))
    const answer = card.back ? `${filled}<div class="face-extra muted" style="margin-top:14px;font-size:0.8em">${renderMath(card.back)}</div>` : filled
    const blanks = card.front.match(/\{\{(?:c\d+::)?([\s\S]*?)\}\}/g) ?? []
    return {
      key: state.key,
      card,
      state,
      prompt,
      answer,
      promptText: htmlToText(card.front.replace(/\{\{[\s\S]*?\}\}/g, ' blank ')),
      answerText: htmlToText(blanks.join(' ')),
      promptLabel: 'Fill the blank',
      answerLabel: 'Answer',
    }
  }
  const showTermFirst = direction === 'term-def' || (direction === 'mixed' && coin(state.key + seed))
  const [p, a] = showTermFirst ? [card.front, card.back] : [card.back, card.front]
  return {
    key: state.key,
    card,
    state,
    prompt: renderMath(p || '<p class="muted">(empty)</p>'),
    answer: renderMath(a || '<p class="muted">(empty)</p>'),
    promptText: htmlToText(p),
    answerText: htmlToText(a),
    promptLabel: showTermFirst ? 'Term' : 'Definition',
    answerLabel: showTermFirst ? 'Definition' : 'Term',
  }
}

/** First letter of each word, rest as underscores: "Donald Trump" -> "D_____ T____". */
export function autoHint(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] + '_'.repeat(Math.max(0, Math.min(w.length - 1, 12))))
    .join(' ')
}

export function speak(text: string) {
  if (!('speechSynthesis' in window) || !text) return
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

export function isLong(html: string) {
  return html.length > 220 || /<(ul|ol|pre|img)/.test(html)
}
