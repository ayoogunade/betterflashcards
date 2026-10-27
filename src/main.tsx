import 'katex/dist/katex.min.css'
import { StrictMode, Suspense, lazy, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { purgeTrash, requestPersistence } from './lib/db'
import { applyPrefs } from './lib/prefs'
import { startSync } from './lib/sync'
import { Shortcuts } from './components/Shortcuts'
import { DeckPage } from './pages/DeckPage'
import { FlashcardsMode } from './pages/FlashcardsMode'
import { Home } from './pages/Home'
import { LearnMode } from './pages/LearnMode'
import { Settings } from './pages/Settings'
import { SpacedMode } from './pages/SpacedMode'
import { Stats } from './pages/Stats'
import { Trash } from './pages/Trash'
import './styles.css'

const EditDeck = lazy(() => import('./pages/EditDeck').then((m) => ({ default: m.EditDeck })))

// A new version waits until you're not studying or editing, so an update never resets a round or
// drops unsaved typing. iOS keeps a Home Screen app alive for days, so also check on resume and hourly.
let updateReady = false
const BUSY = /\/(learn|spaced|flashcards|edit)$/
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true
    applyUpdateIfIdle()
  },
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => navigator.onLine && void reg.update()
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    setInterval(check, 60 * 60_000)
  },
})
function applyUpdateIfIdle() {
  if (updateReady && !BUSY.test(location.pathname)) void updateSW(true)
}

/** Re-checks for a waiting update on every navigation (e.g. closing a study screen). */
function UpdateOnNavigate() {
  const { pathname } = useLocation()
  useEffect(applyUpdateIfIdle, [pathname])
  return null
}
void requestPersistence()
void purgeTrash()
startSync()
applyPrefs()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/trash" element={<Trash />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/deck/:id" element={<DeckPage />} />
        <Route
          path="/deck/:id/edit"
          element={
            <Suspense fallback={null}>
              <EditDeck />
            </Suspense>
          }
        />
        <Route path="/deck/:id/learn" element={<LearnMode />} />
        <Route path="/deck/:id/flashcards" element={<FlashcardsMode />} />
        <Route path="/deck/:id/spaced" element={<SpacedMode />} />
        <Route path="*" element={<Home />} />
      </Routes>
      <Shortcuts />
      <UpdateOnNavigate />
    </BrowserRouter>
  </StrictMode>,
)
