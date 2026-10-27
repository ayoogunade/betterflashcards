// Supabase sync: push rows changed since the last push, then pull rows the server
// received since the last pull. Newest updated_at wins, on both the server (trigger) and here.

import { useSyncExternalStore } from 'react'
import { SYNC_KINDS, db, type SyncKind } from './db'
import { supabase } from './supabase'

interface RemoteRow {
  kind: SyncKind
  id: string
  data: Record<string, unknown> | null
  updated_at: string
  purged: boolean
  server_at: string
}

const PK: Record<SyncKind, string> = { folders: 'id', decks: 'id', cards: 'id', cardStates: 'key', reviewLogs: 'id' }
const STAMP: Record<SyncKind, string> = { folders: 'updated_at', decks: 'updated_at', cards: 'updated_at', cardStates: 'updated_at', reviewLogs: 'reviewed_at' }
const PUSH_CHUNK = 200
const PULL_PAGE = 1000
/** Re-read a few seconds before the cursor in case two server transactions committed out of order. */
const PULL_OVERLAP_MS = 5000

export const stampOf = (kind: SyncKind, row: Record<string, unknown>) => row[STAMP[kind]] as string

/** Apply a pulled row only when it is at least as new as the local copy. */
export function shouldApply(remote: Pick<RemoteRow, 'updated_at'>, localStamp: string | undefined): boolean {
  return !localStamp || Date.parse(remote.updated_at) >= Date.parse(localStamp)
}

// ---- Status, for the Sync settings screen ----

export interface SyncStatus {
  state: 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline'
  lastSynced: string | null
  error?: string
  email?: string | null
}

let status: SyncStatus = { state: supabase ? 'signed-out' : 'off', lastSynced: null }
const listeners = new Set<() => void>()
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => status,
  )
}

const getMeta = async <T>(key: string) => (await db.meta.get(key))?.value as T | undefined
const setMeta = (key: string, value: unknown) => db.meta.put({ key, value })

// ---- Push / pull ----

async function push(userId: string) {
  const startedAt = new Date().toISOString()
  const since = (await getMeta<string>('pushedAt')) ?? ''
  const rows: Omit<RemoteRow, 'server_at'>[] = []
  for (const kind of SYNC_KINDS) {
    const changed = await db.table(kind).where(STAMP[kind]).above(since).toArray()
    for (const r of changed) rows.push({ kind, id: r[PK[kind]], data: r, updated_at: stampOf(kind, r), purged: false })
  }
  const tombs = await db.tombstones.toArray()
  for (const t of tombs) rows.push({ kind: t.kind, id: t.id, data: null, updated_at: t.at, purged: true })

  for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
    const chunk = rows.slice(i, i + PUSH_CHUNK).map((r) => ({ ...r, user_id: userId }))
    const { error } = await supabase!.from('bf_rows').upsert(chunk, { onConflict: 'user_id,kind,id' })
    if (error) throw error
  }
  await db.tombstones.bulkDelete(tombs.map((t) => t.key))
  await setMeta('pushedAt', startedAt)
  return rows.length
}

async function pull() {
  const saved = await getMeta<string>('pulledAt')
  let cursor = saved ? new Date(Date.parse(saved) - PULL_OVERLAP_MS).toISOString() : '1970-01-01T00:00:00Z'
  let total = 0
  for (;;) {
    const { data, error } = await supabase!
      .from('bf_rows')
      .select('kind,id,data,updated_at,purged,server_at')
      .gt('server_at', cursor)
      .order('server_at')
      .limit(PULL_PAGE)
    if (error) throw error
    const page = (data ?? []) as RemoteRow[]
    if (!page.length) break
    await apply(page)
    total += page.length
    cursor = page[page.length - 1].server_at
    await setMeta('pulledAt', cursor)
    if (page.length < PULL_PAGE) break
  }
  return total
}

/** Write pulled rows into IndexedDB without leaving tombstones or re-marking them as local edits. */
export async function apply(page: RemoteRow[]) {
  await db.transaction('rw', [...SYNC_KINDS.map((k) => db.table(k)), db.tombstones], async () => {
    for (const kind of SYNC_KINDS) {
      const rows = page.filter((r) => r.kind === kind)
      if (!rows.length) continue
      const table = db.table(kind)
      const local = await table.bulkGet(rows.map((r) => r.id))
      const put: unknown[] = []
      const del: string[] = []
      rows.forEach((r, i) => {
        const mine = local[i] as Record<string, unknown> | undefined
        if (!shouldApply(r, mine && stampOf(kind, mine))) return
        if (r.purged) del.push(r.id)
        else if (r.data) put.push(r.data)
      })
      if (put.length) await table.bulkPut(put)
      if (del.length) await table.bulkDelete(del)
    }
  })
}

// ---- Scheduling ----

let running: Promise<void> | null = null
let again = false

/** Push then pull. Overlapping calls are coalesced into one follow-up run. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await runOnce()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

async function runOnce() {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return setStatus({ state: 'signed-out', email: null })
  if (!navigator.onLine) return setStatus({ state: 'offline', email: user.email })
  setStatus({ state: 'syncing', email: user.email, error: undefined })
  try {
    await push(user.id)
    await pull()
    const t = new Date().toISOString()
    await setMeta('lastSynced', t)
    setStatus({ state: 'idle', lastSynced: t })
  } catch (e) {
    setStatus({ state: 'error', error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
  }
}

const INTERVAL_MS = 60_000

/** Sync on open, when the app comes back to the foreground or goes to the background, when the network returns, and every minute. */
export function startSync() {
  if (!supabase) return
  void getMeta<string>('lastSynced').then((t) => t && setStatus({ lastSynced: t }))
  supabase.auth.onAuthStateChange((event, session) => {
    setStatus({ email: session?.user.email ?? null })
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') void syncNow()
    if (event === 'SIGNED_OUT') setStatus({ state: 'signed-out' })
  })
  document.addEventListener('visibilitychange', () => void syncNow())
  window.addEventListener('online', () => void syncNow())
  window.addEventListener('offline', () => setStatus({ state: 'offline' }))
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), INTERVAL_MS)
}

// ---- Account ----

/**
 * Email + password. Email codes need a custom email template, which the free Supabase plan
 * doesn't allow, and a magic link would open in Safari instead of the installed Home Screen app.
 */
export async function signIn(email: string, password: string) {
  const { error } = await supabase!.auth.signInWithPassword({ email, password })
  if (error) throw error
}

/** Sign out and forget sync cursors, so signing in again pulls everything. Local decks stay. */
export async function signOut() {
  await supabase!.auth.signOut()
  await db.meta.bulkDelete(['pushedAt', 'pulledAt', 'lastSynced'])
  setStatus({ state: 'signed-out', email: null, lastSynced: null })
}
