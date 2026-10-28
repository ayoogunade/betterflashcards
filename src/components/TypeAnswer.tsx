import { Check, X } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import type { StudyItem } from '../lib/render'
import { compareAnswer } from '../lib/typing'

/**
 * Type-the-answer box under the study card. Enter flips the card; once flipped it shows the typed
 * answer against the real one: missing words underlined green, extra words struck through red.
 */
export function TypeAnswer({ item, flipped, onSubmit }: { item: StudyItem; flipped: boolean; onSubmit: () => void }) {
  const [typed, setTyped] = useState('')
  useEffect(() => setTyped(''), [item.key])

  if (flipped) {
    if (!typed.trim()) return null
    const r = compareAnswer(typed, item.answerText)
    return (
      <div className={`type-result ${r.correct ? 'ok' : ''}`} role="status">
        {r.correct ? <Check size={18} aria-label="Correct" /> : <X size={18} aria-label="Not quite" />}
        <span>
          {r.parts.map((p, i) => (
            <Fragment key={i}>
              <span className={`tw-${p.kind}`}>{p.text}</span>{' '}
            </Fragment>
          ))}
        </span>
      </div>
    )
  }
  return (
    <form
      className="type-answer"
      onSubmit={(e) => {
        e.preventDefault()
        ;(document.activeElement as HTMLElement | null)?.blur()
        onSubmit()
      }}
    >
      <input
        className="input"
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Type the answer, then Enter"
        aria-label="Your answer"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
      />
    </form>
  )
}
