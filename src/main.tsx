import 'katex/dist/katex.min.css'
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
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

// autoUpdate reloads once a new version is installed. iOS keeps a Home Screen app alive for days
// without a fresh page load, so also check for a new version on launch, on resume and hourly.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => navigator.onLine && void reg.update()
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
    setInterval(check, 60 * 60_000)
  },
})
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
    </BrowserRouter>
  </StrictMode>,
)
