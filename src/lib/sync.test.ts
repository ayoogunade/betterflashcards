import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { addCard, createDeck, db, deckCards, destroyDeck, updateDeck } from './db'
import { apply, shouldApply } from './sync'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('sync merge', () => {
  it('newest updated_at wins', () => {
    expect(shouldApply({ updated_at: '2026-10-27T12:00:01Z' }, '2026-10-27T12:00:00.000Z')).toBe(true)
    expect(shouldApply({ updated_at: '2026-10-27T11:59:59Z' }, '2026-10-27T12:00:00.000Z')).toBe(false)
    expect(shouldApply({ updated_at: '2026-10-27T12:00:00+00:00' }, undefined)).toBe(true)
  })

  it('a pulled older edit does not overwrite a newer local one', async () => {
    const d = await createDeck('Local')
    await updateDeck(d.id, { title: 'Newer local title' })
    const local = (await db.decks.get(d.id))!
    const older = { ...local, title: 'Old remote', updated_at: '2020-01-01T00:00:00.000Z' }
    await apply([{ kind: 'decks', id: d.id, data: older, updated_at: older.updated_at, purged: false, server_at: '' }])
    expect((await db.decks.get(d.id))!.title).toBe('Newer local title')

    const newer = { ...local, title: 'Newer remote', updated_at: '2099-01-01T00:00:00.000Z' }
    await apply([{ kind: 'decks', id: d.id, data: newer, updated_at: newer.updated_at, purged: false, server_at: '' }])
    expect((await db.decks.get(d.id))!.title).toBe('Newer remote')
  })

  it('a hard delete leaves a tombstone, and a pulled purge deletes without one', async () => {
    const d = await createDeck('Gone')
    await destroyDeck(d.id)
    expect(await db.tombstones.get(`decks:${d.id}`)).toBeTruthy()

    const e = await createDeck('Remote delete')
    await apply([{ kind: 'decks', id: e.id, data: null, updated_at: '2099-01-01T00:00:00Z', purged: true, server_at: '' }])
    expect(await db.decks.get(e.id)).toBeUndefined()
    expect(await db.tombstones.get(`decks:${e.id}`)).toBeUndefined()
  })
})

describe('JSON backup', () => {
  it('round-trips and does not overwrite newer local edits', async () => {
    const { exportAll, importBackup } = await import('./backup')
    const d = await createDeck('Backed up')
    await db.decks.update(d.id, { updated_at: '2020-01-01T00:00:00.000Z' })
    const file = JSON.stringify(await exportAll())
    await updateDeck(d.id, { title: 'Edited after backup' })
    await importBackup(file)
    expect((await db.decks.get(d.id))!.title).toBe('Edited after backup')
    await db.decks.clear()
    expect(await importBackup(file)).toBeGreaterThan(0)
    expect((await db.decks.get(d.id))!.title).toBe('Backed up')
    await expect(importBackup('{"app":"other"}')).rejects.toThrow()
  })

  it('a shared deck imports as a fresh copy without study data', async () => {
    const { exportDeck, importFile } = await import('./backup')
    const d = await createDeck('To share')
    await addCard(d.id, { type: 'basic', front: '<p>a</p>', back: '<p>b</p>', starred: true })
    const file = JSON.stringify(await exportDeck((await db.decks.get(d.id))!))
    expect(await importFile(file)).toContain('1 card)')
    const copy = (await db.decks.toArray()).find((x) => x.title === 'To share' && x.id !== d.id)!
    const cards = await deckCards(copy.id)
    expect(cards.map((c) => [c.front, c.back, c.starred])).toEqual([['<p>a</p>', '<p>b</p>', false]])
  })
})
