import { describe, expect, it } from 'vitest'
import { clozeCount, parseCloze, renderCloze, stripCloze } from './cloze'
import { parseImport, textToHtml } from './importParser'
import {
  answerRound,
  applyRating,
  currentKey,
  isRoundDone,
  masteryPercent,
  pickRound,
  roundScore,
  startRound,
} from './learn'

describe('status ladder', () => {
  const N = 2
  it('new + got it -> almost done (skips still learning)', () => {
    expect(applyRating({ status: 'new', streak: 0 }, true, false, N)).toEqual({ status: 'almost', streak: 1 })
  })
  it('almost + got it -> mastered', () => {
    expect(applyRating({ status: 'almost', streak: 1 }, true, false, N)).toEqual({ status: 'mastered', streak: 2 })
  })
  it('any miss -> still learning', () => {
    expect(applyRating({ status: 'mastered', streak: 5 }, false, false, N).status).toBe('learning')
    expect(applyRating({ status: 'new', streak: 0 }, false, false, N).status).toBe('learning')
  })
  it('got it in the same round as a miss stays still learning', () => {
    expect(applyRating({ status: 'learning', streak: 0 }, true, true, N)).toEqual({ status: 'learning', streak: 0 })
  })
  it('still learning + got it in a later round -> almost done', () => {
    expect(applyRating({ status: 'learning', streak: 0 }, true, false, N)).toEqual({ status: 'almost', streak: 1 })
  })
  it('correctToMaster = 3 needs three rounds', () => {
    let s = { status: 'new' as const, streak: 0 } as ReturnType<typeof applyRating>
    s = applyRating(s, true, false, 3)
    s = applyRating(s, true, false, 3)
    expect(s.status).toBe('almost')
    s = applyRating(s, true, false, 3)
    expect(s.status).toBe('mastered')
  })
})

describe('pickRound', () => {
  const items = [
    { key: 'n1', status: 'new' as const, order: 0 },
    { key: 'm1', status: 'mastered' as const, order: 1 },
    { key: 'a1', status: 'almost' as const, order: 2 },
    { key: 'l1', status: 'learning' as const, order: 3 },
    { key: 'n2', status: 'new' as const, order: 4 },
  ]
  it('orders learning, almost, new and skips mastered', () => {
    expect(pickRound(items, { size: 7, shuffle: false, reviewMastered: false })).toEqual(['l1', 'a1', 'n1', 'n2'])
  })
  it('respects round size', () => {
    expect(pickRound(items, { size: 2, shuffle: false, reviewMastered: false })).toEqual(['l1', 'a1'])
  })
  it('falls back to mastered when nothing else is left', () => {
    const all = items.map((i) => ({ ...i, status: 'mastered' as const }))
    expect(pickRound(all, { size: 2, shuffle: false, reviewMastered: false })).toEqual(['n1', 'm1'])
  })
})

describe('round', () => {
  it('re-queues a miss two cards later and scores first tries only', () => {
    let r = startRound(['a', 'b', 'c', 'd'])
    r = answerRound(r, false) // a missed
    expect(r.queue).toEqual(['a', 'b', 'c', 'a', 'd'])
    r = answerRound(r, true) // b
    r = answerRound(r, true) // c
    expect(currentKey(r)).toBe('a')
    r = answerRound(r, true) // a retry
    r = answerRound(r, true) // d
    expect(isRoundDone(r)).toBe(true)
    expect(roundScore(r)).toEqual({ correct: 3, total: 4 })
    expect(r.missed).toEqual(['a'])
  })
  it('a miss near the end goes to the end', () => {
    let r = startRound(['a', 'b'])
    r = answerRound(r, true)
    r = answerRound(r, false)
    expect(r.queue).toEqual(['a', 'b', 'b'])
    expect(isRoundDone(r)).toBe(false)
  })
})

describe('mastery', () => {
  it('weights 0, 1/3, 2/3, 1', () => {
    expect(masteryPercent(['new', 'learning', 'almost', 'mastered'])).toBe(50)
    expect(masteryPercent([])).toBe(0)
  })
})

describe('cloze', () => {
  it('numbers unnamed blanks separately and groups cN blanks', () => {
    expect(parseCloze('{{a}} and {{b}}').map((b) => b.group)).toEqual([0, 1])
    expect(parseCloze('{{c1::a}} {{c2::b}} {{c1::c}}').map((b) => b.group)).toEqual([0, 1, 0])
    expect(clozeCount('{{c1::a}} {{c2::b}} {{c1::c}}')).toBe(2)
    expect(clozeCount('no blanks')).toBe(1)
  })
  it('renders the active blank hidden and others as text', () => {
    const t = '{{Donald Trump}} was the {{45th}} president'
    expect(renderCloze(t, 0, false)).toContain('cloze-blank')
    expect(renderCloze(t, 0, false)).toContain('45th')
    expect(renderCloze(t, 0, false)).not.toContain('Donald Trump')
    expect(renderCloze(t, 0, true)).toContain('cloze-revealed">Donald Trump')
    expect(stripCloze(t)).toBe('Donald Trump was the 45th president')
  })
})

describe('import parser', () => {
  it('parses tab + newline', () => {
    const cards = parseImport('Signed\tIntegers that can be negative\nCPU\tProcessor\n\n', { termSep: 'tab', rowSep: 'newline' })
    expect(cards).toEqual([
      { type: 'basic', front: 'Signed', back: 'Integers that can be negative' },
      { type: 'basic', front: 'CPU', back: 'Processor' },
    ])
  })
  it('parses custom separators with escapes', () => {
    const cards = parseImport('a - 1\n\nb - 2', { termSep: 'custom', customTermSep: ' - ', rowSep: 'custom', customRowSep: '\\n\\n' })
    expect(cards.map((c) => [c.front, c.back])).toEqual([['a', '1'], ['b', '2']])
  })
  it('detects cloze rows', () => {
    const [c] = parseImport('{{Donald Trump}} was the 45th president', { termSep: 'tab', rowSep: 'newline' })
    expect(c.type).toBe('cloze')
    expect(c.back).toBe('')
  })
  it('keeps br line breaks and escapes html', () => {
    expect(textToHtml('a<br>b & <c>')).toBe('<p>a<br>b &amp; &lt;c&gt;</p>')
  })
})

describe('stats', async () => {
  const { countByDay, heatmapWeeks, streak } = await import('./stats')
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()
  it('counts by local day and finds the streak (today not studied yet keeps yesterday’s streak)', () => {
    const byDay = countByDay([at(2026, 10, 25), at(2026, 10, 26), at(2026, 10, 26, 23), at(2026, 10, 27)])
    expect(byDay.get('2026-10-26')).toBe(2)
    expect(streak(byDay, new Date(2026, 9, 27, 20))).toBe(3)
    expect(streak(byDay, new Date(2026, 9, 28, 9))).toBe(3)
    expect(streak(byDay, new Date(2026, 9, 29, 9))).toBe(0)
  })
  it('heatmap ends with the current week and scales levels to the busiest day', () => {
    const byDay = countByDay([at(2026, 10, 27), at(2026, 10, 27), at(2026, 10, 27), at(2026, 10, 27), at(2026, 10, 26)])
    const weeks = heatmapWeeks(byDay, 4, new Date(2026, 9, 27))
    const cells = weeks.flat()
    expect(weeks).toHaveLength(4)
    expect(cells.find((c) => c.key === '2026-10-27')!.level).toBe(4)
    expect(cells.find((c) => c.key === '2026-10-26')!.level).toBe(1)
    expect(cells.find((c) => c.key === '2026-10-31')!.future).toBe(true)
  })
})

describe('deck export', async () => {
  const { exportTsv } = await import('./importParser')
  it('writes one tab-separated row per card, keeping line breaks readable', () => {
    expect(exportTsv([{ type: 'basic', front: '<p>Make</p><p>gdb</p>', back: 'Tools &amp; more' }])).toBe('Make / gdb\tTools & more')
  })
  it('turns blanks into ____ with the answers on the back, and skips empty cards', () => {
    expect(exportTsv([{ type: 'cloze', front: '{{Deadlock}} is waiting {{c2::forever}}', back: '' }, { type: 'basic', front: '', back: '' }])).toBe(
      '____ is waiting ____\tDeadlock, forever',
    )
  })
})

describe('leeches', async () => {
  const { isLeech, LEECH_AT } = await import('./learn')
  it('counts Learn misses plus spaced-review lapses', () => {
    expect(isLeech({ lapses: LEECH_AT - 1, srs: null })).toBe(false)
    expect(isLeech({ lapses: LEECH_AT - 2, srs: { lapses: 2 } })).toBe(true)
  })
})
