// Cloze syntax: `{{answer}}` (each one is its own blank) or `{{c1::answer}}` (blanks sharing a
// number are hidden together). Works on plain text and on editor HTML, since braces never
// appear inside tags.

const CLOZE_RE = /\{\{(?:c(\d+)::)?([\s\S]*?)\}\}/g

export interface ClozeBlank {
  /** 0-based study item index this blank belongs to. */
  group: number
  answer: string
}

export function hasCloze(text: string): boolean {
  return /\{\{[\s\S]+?\}\}/.test(text)
}

/** Blanks in order, with groups numbered 0..n-1 in order of first appearance. */
export function parseCloze(text: string): ClozeBlank[] {
  const groupIds = new Map<string, number>()
  const blanks: ClozeBlank[] = []
  let unnamed = 0
  for (const m of text.matchAll(CLOZE_RE)) {
    const id = m[1] ? `c${m[1]}` : `u${unnamed++}`
    if (!groupIds.has(id)) groupIds.set(id, groupIds.size)
    blanks.push({ group: groupIds.get(id)!, answer: m[2] })
  }
  return blanks
}

/** Number of study items a cloze card produces (at least 1, so a card without blanks still shows). */
export function clozeCount(text: string): number {
  const blanks = parseCloze(text)
  return blanks.length ? Math.max(...blanks.map((b) => b.group)) + 1 : 1
}

/**
 * Render cloze text for one study item. The active group becomes a blank (or the highlighted
 * answer when revealed); every other blank shows its answer as plain text.
 */
export function renderCloze(text: string, activeGroup: number, revealed: boolean): string {
  const groupIds = new Map<string, number>()
  let unnamed = 0
  return text.replace(CLOZE_RE, (_m, num: string | undefined, answer: string) => {
    const id = num ? `c${num}` : `u${unnamed++}`
    if (!groupIds.has(id)) groupIds.set(id, groupIds.size)
    if (groupIds.get(id) !== activeGroup) return answer
    return revealed
      ? `<span class="cloze cloze-revealed">${answer}</span>`
      : `<span class="cloze cloze-blank">[&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;]</span>`
  })
}

/** Cloze text with every blank replaced by its answer (for lists and search). */
export function stripCloze(text: string): string {
  return text.replace(CLOZE_RE, (_m, _n, answer: string) => answer)
}
