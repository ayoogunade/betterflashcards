// Type-the-answer mode: compare what was typed with the real answer, word by word.

export interface AnswerPart {
  text: string
  /** ok: typed and right · extra: typed but not in the answer · missing: in the answer but not typed */
  kind: 'ok' | 'extra' | 'missing'
}

/** Lowercase, drop punctuation, so "The CPU." matches "the cpu". */
const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const words = (s: string) => s.split(/\s+/).filter((w) => norm(w))

export function compareAnswer(typed: string, expected: string): { correct: boolean; parts: AnswerPart[] } {
  const a = words(typed)
  const b = words(expected)
  // Longest common subsequence on normalised words.
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = norm(a[i]) === norm(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const parts: AnswerPart[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && norm(a[i]) === norm(b[j])) {
      parts.push({ text: b[j], kind: 'ok' })
      i++
      j++
    } else if (j < b.length && (i >= a.length || lcs[i][j + 1] >= lcs[i + 1][j])) parts.push({ text: b[j++], kind: 'missing' })
    else parts.push({ text: a[i++], kind: 'extra' })
  }
  return { correct: b.length > 0 && parts.every((p) => p.kind === 'ok'), parts }
}
