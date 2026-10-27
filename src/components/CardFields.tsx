import { ArrowLeftRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { hasCloze } from '../lib/cloze'
import { updateCard } from '../lib/db'
import type { Card, CardType } from '../lib/types'
import { RichEditor } from './RichEditor'
import { Seg, Sheet } from './ui'

/** Debounced card save; flushes on unmount so nothing typed is lost. */
export function useCardSaver(cardId: string) {
  const pending = useRef<Partial<Card>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const flush = () => {
    clearTimeout(timer.current)
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length) void updateCard(cardId, patch)
  }
  useEffect(() => flush, [cardId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (patch: Partial<Card>) => {
    pending.current = { ...pending.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 350)
  }
}

interface FieldsProps {
  card: Card
  focus?: 'front' | 'back'
  onTabOut?: () => void
  onShiftTabOut?: () => void
}

/** Type switch + the two rich-text sides of one card. Used by the deck editor and the in-study edit sheet. */
export function CardFields({ card, focus = 'front', onTabOut, onShiftTabOut }: FieldsProps) {
  const save = useCardSaver(card.id)
  const [type, setType] = useState<CardType>(card.type)
  const [field, setField] = useState<'front' | 'back'>(focus)

  // What the editors show. `latest` tracks typing without re-rendering; `ver` remounts both editors
  // after a swap, so even the one being typed in shows its new text.
  const latest = useRef({ front: card.front, back: card.back })
  const [sides, setSides] = useState(latest.current)
  const [ver, setVer] = useState(0)
  useEffect(() => {
    // An outside change (another device, the editor's header buttons), not our own save echoing back.
    if (card.front !== latest.current.front || card.back !== latest.current.back) {
      latest.current = { front: card.front, back: card.back }
      setSides(latest.current)
    }
  }, [card.front, card.back])

  const swap = () => {
    const next = { front: latest.current.back, back: latest.current.front }
    latest.current = next
    setSides(next)
    setVer((v) => v + 1)
    save(next)
  }

  const setFrontAndType = (html: string) => {
    latest.current = { ...latest.current, front: html }
    // Typing {{...}} into a basic card turns it into a cloze card automatically.
    if (type === 'basic' && hasCloze(html)) {
      setType('cloze')
      save({ front: html, type: 'cloze' })
    } else save({ front: html })
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <Seg<CardType>
          value={type}
          options={[
            { value: 'basic', label: 'Basic' },
            { value: 'cloze', label: 'Fill in the blank' },
          ]}
          onChange={(t) => {
            setType(t)
            save({ type: t })
          }}
        />
        {type === 'basic' && (
          <button type="button" className="btn btn-ghost small" style={{ marginLeft: 'auto' }} onClick={swap} aria-label="Swap term and definition" title="Swap term and definition">
            <ArrowLeftRight size={16} /> Swap
          </button>
        )}
      </div>
      <div className="sides">
        <div onFocusCapture={() => setField('front')}>
          <div className="side-label">{type === 'cloze' ? 'Text with {{blanks}}' : 'Term'}</div>
          <div className="side-box">
            <RichEditor
              key={`${card.id}-front-${ver}`}
              value={sides.front}
              placeholder={type === 'cloze' ? '{{Donald Trump}} was the 45th president' : 'Term'}
              autofocus={ver ? field === 'front' : focus === 'front'}
              focused={field === 'front'}
              toolbar={field === 'front'}
              onChange={setFrontAndType}
              onTab={() => setField('back')}
              onShiftTab={onShiftTabOut}
            />
          </div>
        </div>
        <div onFocusCapture={() => setField('back')}>
          <div className="side-label">{type === 'cloze' ? 'Extra info (optional)' : 'Definition'}</div>
          <div className="side-box">
            <RichEditor
              key={`${card.id}-back-${ver}`}
              value={sides.back}
              placeholder={type === 'cloze' ? 'Shown after flipping' : 'Definition'}
              autofocus={ver ? field === 'back' : focus === 'back'}
              focused={field === 'back'}
              toolbar={field === 'back'}
              onChange={(html) => {
                latest.current = { ...latest.current, back: html }
                save({ back: html })
              }}
              onTab={onTabOut}
              onShiftTab={() => setField('front')}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export function EditCardSheet({ card, onClose }: { card: Card; onClose: () => void }) {
  return (
    <Sheet title="Edit card" onClose={onClose}>
      <CardFields card={card} />
      <button className="btn btn-primary btn-block" style={{ marginTop: 16 }} onClick={onClose}>
        Done
      </button>
    </Sheet>
  )
}
