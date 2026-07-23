# ReelTogether

ReelTogether is an installable web app for choosing what to watch or do with friends. Create a shared list, invite someone, swipe separately, and get a match when enough members pick the same movie, show, or activity.

## Included

- Movies, shows, and activity swipe decks
- Live, paginated TMDB movie and TV discovery
- Country-aware streaming availability with provider branding
- Shared genre, language, provider, budget, category, and distance filters
- Adjustable match thresholds
- Shared matches, custom activities, completion history, and bucket lists
- Passwordless accounts, anonymous try-out sessions, and live Supabase syncing
- Partner push notifications for turns, plans, and shared moments
- Installable iPhone PWA with GitHub Pages deployment
- Native Swift prototype under `ios/ReelTogether`

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. Without Supabase values, the app runs in a single-device demo mode.

See [WEBAPP_SETUP.md](WEBAPP_SETUP.md) for the Supabase, GitHub Pages, invite-link, and iPhone installation setup.

The dynamic catalogue is served by the `tmdb-catalog` Supabase Edge Function. Set
its `TMDB_ACCESS_TOKEN` secret to a TMDB API Read Access Token before deploying.
Streaming availability is supplied by JustWatch through TMDB and is attributed in
the app.
