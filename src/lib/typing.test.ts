import { describe, expect, it } from 'vitest'
import { compareAnswer } from './typing'

describe('compareAnswer', () => {
  it('ignores case, punctuation and spacing', () => {
    expect(compareAnswer('  the cpu ', 'The CPU.').correct).toBe(true)
  })

  it('marks missing and extra words', () => {
    const r = compareAnswer('a big process', 'a process scheduler')
    expect(r.correct).toBe(false)
    expect(r.parts).toEqual([
      { text: 'a', kind: 'ok' },
      { text: 'big', kind: 'extra' },
      { text: 'process', kind: 'ok' },
      { text: 'scheduler', kind: 'missing' },
    ])
  })

  it('is never correct against an empty answer', () => {
    expect(compareAnswer('', '').correct).toBe(false)
  })
})
