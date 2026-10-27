import { Eye, EyeOff, X } from 'lucide-react'
import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { STATUS_LABEL, statusCounts } from '../lib/learn'
import type { Status } from '../lib/types'

export const ICON = 20

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={ICON} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  )
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Setting({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="grow">
        <div>{title}</div>
        {desc && <div className="small muted">{desc}</div>}
      </div>
      {children}
    </div>
  )
}

export function NumberInput({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (v: number) => void; label: string }) {
  return (
    <input
      className="input num"
      type="number"
      inputMode="numeric"
      aria-label={label}
      min={min}
      max={max}
      value={value}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10)
        if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)))
      }}
    />
  )
}

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>
}

export function MasteryBar({ statuses }: { statuses: Status[] }) {
  const c = statusCounts(statuses)
  const total = statuses.length || 1
  return (
    <div className="mastery-bar" aria-hidden>
      {(['mastered', 'almost', 'learning', 'new'] as Status[]).map((s) => (
        <div key={s} className={s} style={{ width: `${(c[s] / total) * 100}%` }} />
      ))}
    </div>
  )
}

export function StatGrid({ statuses, active, onPick }: { statuses: Status[]; active?: Status | null; onPick?: (s: Status | null) => void }) {
  const c = statusCounts(statuses)
  return (
    <div className="stat-grid">
      {(['new', 'learning', 'almost', 'mastered'] as Status[]).map((s) => (
        <button
          key={s}
          className="stat"
          style={{ borderColor: active === s ? `var(--st-${s})` : 'transparent', cursor: onPick ? 'pointer' : 'default' }}
          onClick={() => onPick?.(active === s ? null : s)}
        >
          <div className="n" style={{ color: `var(--st-${s})` }}>{c[s]}</div>
          <div className="l">{STATUS_LABEL[s]}</div>
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h2>{title}</h2>
      {children}
    </div>
  )
}

/** Small transient message, optionally with one action (e.g. Undo). */
export function useToast() {
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; run: () => void } } | null>(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  const node = toast ? (
    <div className="toast" role="status">
      {toast.msg}
      {toast.action && (
        <button
          onClick={() => {
            toast.action!.run()
            setToast(null)
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  ) : null
  return { show: setToast, node }
}

/** Password field with the usual show/hide eye button at the right edge. */
export function PasswordInput({ style, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="pw-wrap" style={style}>
      <input {...props} className="input" type={shown ? 'text' : 'password'} />
      <button type="button" className="icon-btn sm" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((v) => !v)}>
        {shown ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  )
}
