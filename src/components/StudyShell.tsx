import { Settings2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ICON, NumberInput, Seg, Setting, Sheet, Switch } from './ui'
import { isGroupKey, resetProgress, updateDeck } from '../lib/db'
import { backHref } from '../lib/hooks'
import { getPrefs, setPrefs } from '../lib/prefs'
import { GRADES, GRADE_LABEL, formatInterval } from '../lib/srs'
import type { Deck, DeckSettings, Direction } from '../lib/types'

/** Header (close, title, options) + round progress bar shared by every study mode. */
export function StudyShell({
  deck,
  progress,
  onOptions,
  children,
}: {
  deck: Deck
  progress: number | null
  onOptions: () => void
  children: ReactNode
}) {
  const nav = useNavigate()
  return (
    <div className="study">
      <div className="study-head">
        <button className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={() => nav(backHref(deck.id))}>
          <X size={ICON} />
        </button>
        <div className="title truncate">{deck.title}</div>
        <button className="icon-btn" aria-label="Study options" onClick={onOptions}>
          <Settings2 size={ICON} />
        </button>
      </div>
      <div className="progress" aria-hidden>
        <div style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
      </div>
      {children}
    </div>
  )
}

type OptionKey = keyof DeckSettings

/** Study options, saved on the deck. `show` picks which settings a mode uses. */
export function StudyOptions({
  deck,
  show,
  onClose,
  onReset,
  reset = 'study',
}: {
  deck: Deck
  show: OptionKey[]
  onClose: () => void
  onReset: () => void
  /** What the reset button clears: Learn/Flashcards progress, or the spaced repetition schedule. */
  reset?: 'study' | 'schedule'
}) {
  return (
    <Sheet title="Options" onClose={onClose}>
      <SettingsFields value={deck.settings} show={show} onChange={(patch) => saveSettings(deck, patch)} />
      <button
        className="btn btn-danger btn-block"
        style={{ marginTop: 16 }}
        onClick={async () => {
          const msg =
            reset === 'study'
              ? 'Reset progress for this deck? Every card goes back to New.'
              : 'Reset the review schedule for this deck? Every card becomes new to spaced repetition.'
          if (!confirm(msg)) return
          onReset()
          await resetProgress(deck.id, reset)
          onClose()
        }}
      >
        {reset === 'study' ? 'Reset progress and restart' : 'Reset schedule'}
      </button>
    </Sheet>
  )
}

/** A real deck keeps its options; a folder or all-deck session keeps them in this device's preferences. */
function saveSettings(deck: Deck, patch: Partial<DeckSettings>) {
  if (!isGroupKey(deck.id)) return updateDeck(deck.id, { settings: { ...deck.settings, ...patch } })
  const { groupSettings } = getPrefs()
  setPrefs({ groupSettings: { ...groupSettings, [deck.id]: { ...groupSettings[deck.id], ...patch } } })
}

/** The option rows themselves, shared by study Options and the new-deck defaults in Settings. */
export function SettingsFields({ value: s, show, onChange: set }: { value: DeckSettings; show: OptionKey[]; onChange: (patch: Partial<DeckSettings>) => void }) {
  const has = (k: OptionKey) => show.includes(k)
  return (
    <>
      {has('direction') && (
        <Setting title="Show first" desc="Definition first means you recall the term">
          <Seg<Direction>
            value={s.direction}
            onChange={(direction) => set({ direction })}
            options={[
              { value: 'def-term', label: 'Definition' },
              { value: 'term-def', label: 'Term' },
              { value: 'mixed', label: 'Mixed' },
            ]}
          />
        </Setting>
      )}
      {has('roundSize') && (
        <Setting title="Cards per round">
          <NumberInput label="Cards per round" value={s.roundSize} min={1} max={50} onChange={(roundSize) => set({ roundSize })} />
        </Setting>
      )}
      {has('correctToMaster') && (
        <Setting title="Correct rounds to master" desc="Rounds in a row a card must be right">
          <NumberInput label="Correct rounds to master" value={s.correctToMaster} min={1} max={6} onChange={(correctToMaster) => set({ correctToMaster })} />
        </Setting>
      )}
      {has('sortPiles') && (
        <Setting title="Sort into Know / Don't know" desc="Off: just flip through the cards">
          <Switch label="Sort into piles" on={s.sortPiles} onChange={(sortPiles) => set({ sortPiles })} />
        </Setting>
      )}
      {has('srsMode') && (
        <Setting title="Scheduler" desc={s.srsMode === 'fsrs' ? 'Intervals grow as you remember' : 'Same interval every time for each button'}>
          <Seg<DeckSettings['srsMode']>
            value={s.srsMode}
            onChange={(srsMode) => set({ srsMode })}
            options={[
              { value: 'fsrs', label: 'FSRS' },
              { value: 'fixed', label: 'Fixed' },
            ]}
          />
        </Setting>
      )}
      {has('newPerDay') && (
        <Setting title="New cards per day">
          <NumberInput label="New cards per day" value={s.newPerDay} min={0} max={500} onChange={(newPerDay) => set({ newPerDay })} />
        </Setting>
      )}
      {has('retention') && s.srsMode === 'fsrs' && (
        <Setting title="Target recall %" desc="Higher means more reviews">
          <NumberInput label="Target recall percent" value={Math.round(s.retention * 100)} min={70} max={99} onChange={(n) => set({ retention: n / 100 })} />
        </Setting>
      )}
      {has('fixedMinutes') && s.srsMode === 'fixed' &&
        GRADES.map((g) => (
          <Setting key={g} title={`${GRADE_LABEL[g]} (minutes)`} desc={formatInterval(s.fixedMinutes[g - 1] * 60_000)}>
            <NumberInput
              label={`${GRADE_LABEL[g]} interval in minutes`}
              value={s.fixedMinutes[g - 1]}
              min={1}
              max={525_600}
              onChange={(n) => set({ fixedMinutes: s.fixedMinutes.map((m, i) => (i === g - 1 ? n : m)) })}
            />
          </Setting>
        ))}
      {has('examDate') && (
        <Setting title="Exam date" desc="Every card comes up again by the day before">
          <div className="row" style={{ gap: 4 }}>
            <input
              className="input"
              type="date"
              value={s.examDate ?? ''}
              onChange={(e) => set({ examDate: e.target.value || null })}
              aria-label="Exam date"
              style={{ width: 'auto' }}
            />
            {s.examDate && (
              <button className="icon-btn sm" aria-label="Clear exam date" onClick={() => set({ examDate: null })}>
                <X size={16} />
              </button>
            )}
          </div>
        </Setting>
      )}
      {has('typeAnswer') && (
        <Setting title="Type the answer" desc="Type it before flipping, then compare">
          <Switch label="Type the answer" on={!!s.typeAnswer} onChange={(typeAnswer) => set({ typeAnswer })} />
        </Setting>
      )}
      {has('starredOnly') && (
        <Setting title="Starred cards only">
          <Switch label="Starred cards only" on={s.starredOnly} onChange={(starredOnly) => set({ starredOnly })} />
        </Setting>
      )}
      {has('shuffle') && (
        <Setting title="Shuffle">
          <Switch label="Shuffle" on={s.shuffle} onChange={(shuffle) => set({ shuffle })} />
        </Setting>
      )}
      {has('reviewMastered') && (
        <Setting title="Include mastered cards" desc="Otherwise they only return once everything is mastered">
          <Switch label="Include mastered cards" on={s.reviewMastered} onChange={(reviewMastered) => set({ reviewMastered })} />
        </Setting>
      )}
      {has('autoplayTts') && (
        <Setting title="Read cards aloud">
          <Switch label="Read cards aloud" on={s.autoplayTts} onChange={(autoplayTts) => set({ autoplayTts })} />
        </Setting>
      )}
    </>
  )
}
