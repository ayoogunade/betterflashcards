// Manual JSON backup: every synced table in one file. Restoring merges with the same
// newest-wins rule as sync, so importing an old backup never overwrites newer work.

import { SYNC_KINDS, db, type SyncKind } from './db'
import { apply, stampOf } from './sync'

export interface Backup {
  app: 'betterflashcards'
  version: 1
  exported_at: string
  tables: Record<SyncKind, Record<string, unknown>[]>
}

const ID: Record<SyncKind, string> = { folders: 'id', decks: 'id', cards: 'id', cardStates: 'key', reviewLogs: 'id' }

export async function exportAll(): Promise<Backup> {
  const tables = {} as Backup['tables']
  for (const kind of SYNC_KINDS) tables[kind] = await db.table(kind).toArray()
  return { app: 'betterflashcards', version: 1, exported_at: new Date().toISOString(), tables }
}

/** Save text as a file (a share sheet on iOS, a download on the Mac). */
export function downloadFile(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}

export async function downloadBackup() {
  downloadFile(`betterflashcards-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll()), 'application/json')
}

/** Returns how many rows were in the file. */
export async function importBackup(text: string): Promise<number> {
  const data = JSON.parse(text) as Partial<Backup>
  if (data.app !== 'betterflashcards' || !data.tables) throw new Error('Not a BetterFlashcards backup file')
  let n = 0
  for (const kind of SYNC_KINDS) {
    const rows = data.tables[kind] ?? []
    await apply(rows.map((r) => ({ kind, id: String(r[ID[kind]]), data: r, updated_at: stampOf(kind, r), purged: false, server_at: '' })))
    n += rows.length
  }
  // Push everything on the next sync, so restored rows reach the server too (it ignores ones it already has).
  await db.meta.delete('pushedAt')
  return n
}
