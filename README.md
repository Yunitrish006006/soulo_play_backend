Soulo Play backend

Cloudflare Worker API modeled after the Taiwan Brawl portal backend.

Main features in this pass:
- Google sign-in token exchange
- Cookie-based session restore via `/api/me`
- Profile update
- Theme, font scale, and locale preferences
- Uploaded avatar storage in KV
- Static Flutter web asset serving from `STATIC_ASSETS`

Setup notes:

1. Install dependencies

```bash
npm install
```

2. Create a D1 database and replace the placeholder `database_id` in `wrangler.jsonc`

```bash
wrangler d1 create soulo_play_db
```

3. Apply migrations

```bash
npm run db:migrate:local
```

4. Set the same Google Web Client ID in both places
- `wrangler.jsonc` -> `vars.GOOGLE_WEB_CLIENT_ID`
- Flutter run/build -> `--dart-define=GOOGLE_WEB_CLIENT_ID=...`

5. Run locally

```bash
npm run dev
```
