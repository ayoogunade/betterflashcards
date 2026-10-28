import { Suspense, lazy } from 'react'
import type { EditCardSheetProps } from './CardFields'

const Sheet = lazy(() => import('./CardFields').then((m) => ({ default: m.EditCardSheet })))

/** Loads the rich-text editor only when a card is actually edited. */
export function EditCardSheet(props: EditCardSheetProps) {
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  )
}
