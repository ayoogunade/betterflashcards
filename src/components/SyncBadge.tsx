import { CloudAlert, CloudOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useSyncStatus } from '../lib/sync'
import { ICON } from './ui'

/** Shows only when sync needs attention: offline or failed. Syncing every minute would just flicker. */
export function SyncBadge() {
  const { state, error } = useSyncStatus()
  const view = {
    offline: { icon: <CloudOff size={ICON} />, label: 'Offline. Changes sync when you reconnect', tone: 'var(--ink-3)' },
    error: { icon: <CloudAlert size={ICON} />, label: `Sync failed: ${error ?? 'unknown error'}`, tone: 'var(--danger)' },
  }[state as 'offline' | 'error']
  if (!view) return null
  return (
    <Link className="icon-btn" to="/settings" aria-label={view.label} title={view.label} style={{ color: view.tone }}>
      {view.icon}
    </Link>
  )
}
