import { ArrowLeft, BarChart3, ChevronRight, CloudOff, Download, Keyboard, LogIn, LogOut, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SettingsFields } from '../components/StudyShell'
import { ICON, PasswordInput, Seg, Setting, useToast } from '../components/ui'
import { downloadBackup, importBackup } from '../lib/backup'
import { setPrefs, usePrefs, type Theme } from '../lib/prefs'
import { openShortcuts } from '../components/Shortcuts'
import { formatInterval } from '../lib/srs'
import { signIn, signOut, syncNow, useSyncStatus } from '../lib/sync'

const STATE_LABEL = {
  off: 'Not set up in this build',
  'signed-out': 'Signed out',
  idle: 'Up to date',
  syncing: 'Syncing…',
  error: 'Sync failed',
  offline: 'Offline, will sync when back online',
} as const

export function Settings() {
  const sync = useSyncStatus()
  const prefs = usePrefs()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const signedIn = sync.state !== 'off' && sync.state !== 'signed-out'
  const ago = sync.lastSynced ? formatInterval(Date.now() - Date.parse(sync.lastSynced)) : null

  return (
    <div className="page">
      <div className="topbar">
        <Link to="/" className="icon-btn" aria-label="Back to library">
          <ArrowLeft size={ICON} />
        </Link>
        <h1>Settings</h1>
      </div>

      <div className="section">
        <h3 className="section-title">Sync</h3>
        <div className="panel">
          {sync.state === 'off' ? (
            <div className="row">
              <CloudOff size={ICON} className="muted" />
              <div className="grow small muted">This build has no Supabase keys, so decks stay on this device.</div>
            </div>
          ) : signedIn ? (
            <>
              <Setting title={sync.email ?? 'Signed in'} desc={`${STATE_LABEL[sync.state]}${ago && sync.state !== 'syncing' ? ` · last synced ${ago} ago` : ''}`}>
                <button className="btn" onClick={() => void syncNow()} disabled={sync.state === 'syncing'}>
                  <RefreshCw size={16} className={sync.state === 'syncing' ? 'spin' : ''} /> Sync now
                </button>
              </Setting>
              {sync.error && <div className="small" style={{ color: 'var(--st-learning)', marginTop: 8 }}>{sync.error}</div>}
              <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={() => run(signOut)}>
                <LogOut size={16} /> Sign out
              </button>
              <div className="small muted" style={{ marginTop: 6 }}>Signing out keeps the decks on this device.</div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                run(() => signIn(email.trim(), password))
              }}
            >
              <p className="small muted" style={{ marginTop: 0 }}>
                Sign in to back up your decks and keep iPhone, iPad and Mac in step. New sign-ups are turned off; this is a one-account app.
              </p>
              <input
                className="input"
                type="email"
                autoComplete="username"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-label="Email"
                required
              />
              <PasswordInput
                style={{ marginTop: 10 }}
                autoComplete="current-password"
                placeholder="Password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Password"
                required
              />
              <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} type="submit" disabled={busy}>
                <LogIn size={16} /> {busy ? 'Working…' : 'Sign in'}
              </button>
              {err && <div className="small" style={{ color: 'var(--st-learning)', marginTop: 8 }}>{err}</div>}
            </form>
          )}
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Library</h3>
        <div className="list">
          <Link className="list-item" to="/stats">
            <BarChart3 size={ICON} />
            <span className="grow">Stats</span>
            <ChevronRight size={18} className="muted" />
          </Link>
          <Link className="list-item" to="/trash">
            <Trash2 size={ICON} />
            <span className="grow">Trash</span>
            <ChevronRight size={18} className="muted" />
          </Link>
          <button className="list-item" onClick={openShortcuts}>
            <Keyboard size={ICON} />
            <span className="grow" style={{ textAlign: 'left' }}>Keyboard shortcuts</span>
            <span className="kbd">?</span>
          </button>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Appearance</h3>
        <div className="panel">
          <Setting title="Theme">
            <Seg<Theme>
              value={prefs.theme}
              onChange={(theme) => setPrefs({ theme })}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Setting>
          <Setting title="Card text size" desc="On this device">
            <Seg<string>
              value={String(prefs.cardScale)}
              onChange={(v) => setPrefs({ cardScale: Number(v) })}
              options={[
                { value: '0.85', label: 'S' },
                { value: '1', label: 'M' },
                { value: '1.15', label: 'L' },
                { value: '1.3', label: 'XL' },
              ]}
            />
          </Setting>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">New deck defaults</h3>
        <div className="panel">
          <SettingsFields
            value={prefs.deckDefaults}
            show={['direction', 'roundSize', 'correctToMaster', 'srsMode', 'newPerDay', 'retention', 'fixedMinutes', 'shuffle', 'autoplayTts']}
            onChange={(patch) => setPrefs({ deckDefaults: { ...prefs.deckDefaults, ...patch } })}
          />
          <div className="small muted" style={{ marginTop: 8 }}>Existing decks keep their own options (change them from a study screen).</div>
        </div>
      </div>

      <div className="section">
        <h3 className="section-title">Backup</h3>
        <div className="panel">
          <p className="small muted" style={{ marginTop: 0 }}>
            A JSON file with every deck, card and review. Importing merges it in: anything newer on this device is kept.
          </p>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn" onClick={() => void downloadBackup()}>
              <Download size={16} /> Export everything
            </button>
            <button className="btn" onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> Import backup
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              try {
                const n = await importBackup(await file.text())
                toast.show({ msg: `Imported ${n} rows` })
                void syncNow()
              } catch (err) {
                toast.show({ msg: err instanceof Error ? err.message : String(err) })
              }
            }}
          />
        </div>
      </div>
      {toast.node}
    </div>
  )
}
