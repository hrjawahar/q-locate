# Q-Locate — Quick location guide

React PWA on a Cloudflare Worker (static assets + API), D1 database, R2 photos.

## First-time setup (Phases 1–3)

```bash
npm install
npx wrangler login
npx wrangler d1 create q-locate-db          # copy the database_id it prints
npx wrangler r2 bucket create q-locate-photos
```

1. Paste the `database_id` into `wrangler.toml` (replace `REPLACE_WITH_DATABASE_ID`).
2. In `seed/seed.sql`, replace `you@example.com` with your email.
3. Create the tables and test data:

```bash
npm run db:migrate:local && npm run db:seed:local      # practice copy on your computer
npm run db:migrate:remote && npm run db:seed:remote    # the real database
```

4. Push to GitHub, then Cloudflare → Workers & Pages → Create → Pages → Connect to Git → `q-locate`.
   Build command `npm run build`, output folder `dist`. Add your custom domain.
   Bindings (DB, PHOTOS) come from `wrangler.toml` — no dashboard binding setup needed.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | App screens only, fast reload (no API) |
| `npm run cf` | Full app + API locally, with the local database |
| `npm run typecheck` | Check the code for mistakes |
| `git add -A && git commit -m "..." && git push` | Save and deploy |

## Check it works (Phase 3)

With `npm run cf` running, open:

- `http://localhost:8787/` — coming-soon page
- `http://localhost:8787/api/index.json` — published places (2 test places)
- `http://localhost:8787/api/places/palani-murugan-tn` — one place in full
- `http://localhost:8787/api/search?q=kodai` — search fallback

Publish another test place:

```bash
npx wrangler d1 execute q-locate-db --local --command "UPDATE places SET status='published' WHERE slug='varkala-kl'; UPDATE meta SET value = CAST(value AS INTEGER) + 1 WHERE key='index_version'"
```

(Use `--remote` for the live database.) Test places say "TEST" in their summary — archive them before launch.

## Where things are

- `src/` — screens (React)
- `worker/` — data API (`/api/index.json`, `/api/places/:slug`, `/api/search`) and photos (`/img/<key>`)
- `migrations/` — database tables · `seed/` — starter data

## Admin app (q-locate-admin)

A second Worker from the same repo, locked by Cloudflare Access. Config: `wrangler.admin.toml`.
Deploy command in Cloudflare: `npx wrangler deploy --config wrangler.admin.toml`.
After enabling Access, set `TEAM_DOMAIN` and `POLICY_AUD` in `wrangler.admin.toml`.
Local test: `npx wrangler dev -c wrangler.admin.toml --var DEV_ADMIN_EMAIL:you@example.com` (only works on localhost).
