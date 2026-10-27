import { Suspense, lazy } from 'react'
import type { Card } from '../lib/types'

const Sheet = lazy(() => import('./CardFields').then((m) => ({ default: m.EditCardSheet })))

/** Loads the rich-text editor only when a card is actually edited. */
export function EditCardSheet(props: { card: Card; onClose: () => void }) {
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  )
}
