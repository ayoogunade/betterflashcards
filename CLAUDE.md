# BetterFlashcards

Personal offline-first flashcard PWA. Vite + React + TS, Dexie (IndexedDB), Tiptap, KaTeX, ts-fsrs, lucide-react.

## Workflow
- After finishing a feature: run checks, commit, push, deploy. No need to ask.
- Checks: `npx tsc -b` and `npx vitest run`.
- Deploy: `vercel --global-config ~/.vercel-ayoogunade deploy --prod --yes` (live at https://betterflashcards.vercel.app).
- Dev server: `npx vite --port 5280 --strictPort --host`. Browser tests use agent-browser session `bfdev`.

## Rules
- The repo is public. Keep course names, other project names, source-app names and anything in gitignored notes out of tracked files, comments and UI text.
- Commits carry no AI attribution lines.
- Icons are lucide only, no emojis. Icon-only buttons need an `aria-label`.
- Reuse existing components before adding new ones (`components/ui.tsx`, `CardFields.tsx`, `StudyShell.tsx`).

## Layout
- `src/lib/`: data and logic. `db.ts` (Dexie, soft deletes, `hardDelete` tombstones), `sync.ts` (Supabase push/pull, newest wins), `srs.ts` (FSRS or fixed intervals), `learn.ts`, `stats.ts`, `backup.ts`, `prefs.ts` (per-device settings), `hooks.ts` (`useDeck`, `useKeys`, folder group keys).
- `src/pages/`: Library, DeckPage, EditDeck, LearnMode, FlashcardsMode, SpacedMode, Stats, Settings.
- `src/components/`: `CardFields.tsx` (card editor, EditCardSheet, CardPreview), `RichEditor.tsx` (Tiptap and the shared EditorToolbar), `StudyCard.tsx`, `ui.tsx`.

## Sync
- Supabase table `bf_rows` (`supabase/migrations/`), with an LWW trigger, RLS and `server_at` as the pull cursor. The Supabase project is shared with another app, so only touch `bf_rows`.
- Email + password auth, and signups are disabled. Keys live in `.env.local` (gitignored); tests blank them in `vite.config.ts`.
- Vercel cron `/api/keepalive` keeps the free project awake.
