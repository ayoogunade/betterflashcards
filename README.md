# BetterFlashcards

A personal, offline-first flashcard app (PWA) for iPhone, iPad and Mac. Cards are recalled and
self-graded by flipping, never typed.

- **Learn:** rounds of 7 cards. A miss comes back a couple of cards later, and each card climbs
  New → Almost done → Mastered.
- **Spaced review:** FSRS (via [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs)) or
  fixed intervals per button.
- **Flashcards:** flip through, optionally sorting into Know / Don't know.
- Rich text, LaTeX (`$...$`), images and fill-in-the-blank (`{{...}}`) cards; paste import; stats with
  a review heatmap; JSON backup; keyboard shortcuts (`?`).
- Works offline (IndexedDB via Dexie). Optional sync through Supabase.

## Run

```bash
npm install
npm run dev        # http://localhost:5173, also on your LAN
npm test           # unit tests
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active)
```

Offline mode and Add to Home Screen need HTTPS, so on iOS they only work on a deployed copy.

## Sync (optional)

Create `.env.local` with:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

Run `supabase/migrations/*.sql` in that project. It creates one `bf_rows` table protected by
row-level security, so each signed-in user only sees their own rows. Without these variables the
app runs local-only. Sign in from Settings with email + password.

Sync runs on open, when the app is foregrounded or backgrounded, when the network returns, every
60 s, and from **Sync now**. The newest edit wins.

## Where things are

| Path | What |
|---|---|
| `src/lib/learn.ts` | Learn mode: round picking, retry gap, status ladder, mastery % |
| `src/lib/srs.ts` | Spaced repetition: FSRS / fixed intervals, session queue, due counts |
| `src/lib/sync.ts` | Push/pull with Supabase, newest-wins merge, sign-in |
| `src/lib/db.ts` | Dexie (IndexedDB) schema and every write |
| `src/lib/cloze.ts` | `{{blank}}` / `{{c1::blank}}` parsing and rendering |
| `src/lib/importParser.ts` | Paste import with custom separators |
| `src/components/StudyCard.tsx` | Flip card with swipe, shared by every study mode |
| `src/components/RichEditor.tsx` | Tiptap editor (toolbar, Cmd+Shift+C blank, images, Tab between sides) |
| `src/pages/` | Library, deck, editor, study modes, stats, settings, trash |
| `api/keepalive.ts` | Daily Vercel cron so a free Supabase project doesn't pause |

## Licence

MIT
