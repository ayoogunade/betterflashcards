import { Lightbulb, Pencil, Star, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { updateCard } from '../lib/db'
import { useKeys } from '../lib/hooks'
import { autoHint, isLong, speak, type StudyItem } from '../lib/render'

interface Props {
  item: StudyItem
  flipped: boolean
  onFlip: () => void
  /** Called on a completed swipe, flipped or not (skip a card you already know). right = got it / know. */
  onSwipe?: (dir: 'left' | 'right') => void
  onEdit: () => void
  badge?: ReactNode
  swipeLabels?: { left: string; right: string }
  /** H hint, R read aloud, E edit, * star. Off while a sheet is open. */
  keys?: boolean
}

const SWIPE_PX = 90

/** True when (x, y) is over a character of the card's selectable text, not just blank space beside it. */
function overText(x: number, y: number): boolean {
  const el = document.elementFromPoint(x, y)
  if (!el?.closest('.face-body, .face-prompt-mini, .face-hint')) return false
  if (el.closest('img, .katex')) return true
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  let node: Node | undefined
  let offset = 0
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (pos) ({ offsetNode: node, offset } = pos)
  else {
    const r = document.caretRangeFromPoint?.(x, y)
    if (r) ({ startContainer: node, startOffset: offset } = r)
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return false
  // The caret lands on the nearest character even beside the text, so check that character's box.
  const len = node.textContent?.length ?? 0
  for (const start of [offset, offset - 1]) {
    if (start < 0 || start >= len) continue
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, start + 1)
    for (const rect of range.getClientRects()) if (x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2) return true
  }
  return false
}

/** Flip card shared by every study mode: tap/Space flips, swipe grades (with or without flipping first). */
export function StudyCard({ item, flipped, onFlip, onSwipe, onEdit, badge, swipeLabels, keys = true }: Props) {
  const [hint, setHint] = useState(false)
  const [dx, setDx] = useState(0)
  const [noAnim, setNoAnim] = useState(true)
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean; onText: boolean; mouse: boolean } | null>(null)

  // New card: show its front instantly instead of animating back from the previous card's answer.
  useEffect(() => {
    setHint(false)
    setDx(0)
    setNoAnim(true)
    const t = requestAnimationFrame(() => setNoAnim(false))
    return () => cancelAnimationFrame(t)
  }, [item.key])

  useKeys((e) => {
    if (!keys) return
    const k = e.key.toLowerCase()
    if (k === 'h' && !flipped) setHint((h) => !h)
    else if (k === 'r') speak(flipped ? item.answerText : item.promptText)
    else if (k === 'e') onEdit()
    else if (e.key === '*') void updateCard(item.card.id, { starred: !item.card.starred })
  })

  // Tapping the card flips it, except on the card's text: there a click, double-click, drag or long
  // press selects words as usual. With a mouse, dragging never swipes (it selects); touch still swipes.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const onText = overText(e.clientX, e.clientY)
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, onText, mouse: e.pointerType === 'mouse' }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || d.mouse) return
    const mx = e.clientX - d.x
    if (!d.moved && Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(e.clientY - d.y)) {
      d.moved = true
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
    if (d.moved && onSwipe) setDx(mx)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) {
      if (onSwipe && Math.abs(dx) > SWIPE_PX) onSwipe(dx > 0 ? 'right' : 'left')
      setDx(0)
      return
    }
    const still = Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6
    if (still && !d.onText) {
      window.getSelection()?.removeAllRanges()
      onFlip()
    }
  }

  const tools = (
    <>
      <button className="icon-btn sm" aria-label="Show hint" title="Hint" onClick={() => setHint((h) => !h)}>
        <Lightbulb size={18} />
      </button>
      <button className="icon-btn sm" aria-label="Read aloud" onClick={() => speak(flipped ? item.answerText : item.promptText)}>
        <Volume2 size={18} />
      </button>
      <button className="icon-btn sm" aria-label="Edit card" onClick={onEdit}>
        <Pencil size={18} />
      </button>
      <button
        className={`icon-btn sm ${item.card.starred ? 'star-on' : ''}`}
        aria-label={item.card.starred ? 'Unstar' : 'Star'}
        onClick={() => updateCard(item.card.id, { starred: !item.card.starred })}
      >
        <Star size={18} fill={item.card.starred ? 'currentColor' : 'none'} />
      </button>
    </>
  )

  const tilt = Math.max(-1, Math.min(1, dx / 200))
  return (
    <div
      className="flip-stage"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        drag.current = null
        setDx(0)
      }}
      style={{ transform: `translateX(${dx}px) rotate(${tilt * 4}deg)`, transition: dx ? 'none' : 'transform 0.2s' }}
    >
      {swipeLabels && (
        <>
          <div className="swipe-tag left" style={{ opacity: Math.max(0, -tilt * 1.5) }}>{swipeLabels.left}</div>
          <div className="swipe-tag right" style={{ opacity: Math.max(0, tilt * 1.5) }}>{swipeLabels.right}</div>
        </>
      )}
      <div className={`flip ${flipped ? 'flipped' : ''} ${noAnim ? 'no-anim' : ''}`}>
        <div className="face" aria-hidden={flipped}>
          <div className="face-top">
            <span className="label">{item.promptLabel}</span>
            {!flipped && tools}
          </div>
          <div className={`face-body rich ${isLong(item.prompt) ? 'long' : ''}`} dangerouslySetInnerHTML={{ __html: item.prompt }} />
          {hint && !flipped && <div className="face-hint">{item.card.hint || autoHint(item.answerText)}</div>}
          <div className="face-foot">
            {badge}
            <span className="tap-hint">Tap to flip</span>
          </div>
        </div>
        <div className="face back" aria-hidden={!flipped}>
          <div className="face-top">
            <span className="label">{item.answerLabel}</span>
            {flipped && tools}
          </div>
          {item.card.type !== 'cloze' && (
            <div className="face-prompt-mini rich" dangerouslySetInnerHTML={{ __html: item.prompt }} />
          )}
          <div className={`face-body rich ${isLong(item.answer) ? 'long' : ''}`} dangerouslySetInnerHTML={{ __html: item.answer }} />
          {badge && <div className="face-foot">{badge}</div>}
        </div>
      </div>
    </div>
  )
}
