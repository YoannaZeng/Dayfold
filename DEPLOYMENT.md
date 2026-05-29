# Dayfold Public Test Deployment

This guide prepares the first public beta deployment without touching local `dayfold_v2` or `dayfold_test` data.

## Recommended Stack

- App hosting: Vercel
- Database: managed PostgreSQL
- ORM: Prisma
- Runtime: Next.js App Router

## Production Environment Variables

Set these in the hosting provider before building:

```bash
DATABASE_URL="postgresql://..."
DAYFOLD_SESSION_SECRET="a-long-random-secret-at-least-32-characters"
DAYFOLD_PUBLIC_ORIGIN="https://your-production-domain.com"
```

Notes:

- `DATABASE_URL` must point to the production PostgreSQL database, not local `dayfold_v2` or `dayfold_test`.
- `DAYFOLD_SESSION_SECRET` must be stable. If it changes, existing sessions will be logged out.
- `DAYFOLD_PUBLIC_ORIGIN` is used by the same-origin write guard. Use only the origin, without a trailing path.
- Do not set `DAYFOLD_CLAIM_LEGACY_DEMO_USER` in production.
- `.env.production.example` shows the required names, but real production values should live in the hosting provider or an ignored shell file.

For a local production check with an ignored `.env.production` file:

```bash
set -a
source .env.production
set +a
```

## First Deploy Sequence

1. Create a production PostgreSQL database.
2. Set the three production environment variables above.
3. Run the production preflight locally or in CI with the production values available:

```bash
npm run deploy:preflight
```

4. Apply database migrations to the production database:

```bash
npm run deploy:migrate
```

This command first reruns the production env check, then runs `prisma migrate deploy`, then confirms migration status. It never runs `migrate reset`.

5. Use this build command on Vercel:

```bash
npm run vercel-build
```

6. After deploy, run:

```bash
npm run deploy:health
```

Expected result:

```json
{ "ok": true, "service": "dayfold", "database": "reachable" }
```

You can override the checked URL with `DAYFOLD_HEALTH_URL` when the public origin is not the exact endpoint to test:

```bash
DAYFOLD_HEALTH_URL="https://your-production-domain.com/api/health" npm run deploy:health
```

## Public Beta Acceptance Checklist

- Register a new account.
- Confirm the onboarding appears for an empty account.
- Add a today plan with a tag.
- Record linked progress with a time range.
- Confirm today's actual aggregates the progress.
- Add a project note and a plain daily note.
- Switch to week view and confirm weekly actual / notes are visible.
- Export data from `Beta / 数据安全`.
- Log out and log back in.
- Confirm the same data is still present.
- Create a second test account and confirm it cannot see the first account's data.

## Rollback / Safety

- If the app deploy fails before migrations, rollback the app deployment only.
- If migrations apply but the app has a UI issue, rollback the app deployment first; do not reset the production database.
- If a data issue appears, export affected user data before any manual repair.
- The current app includes account-scoped export and account-scoped data clearing. Clearing data keeps the account but removes that account's product content.

## Local Preview Separation

- Personal local app: `http://127.0.0.1:3001`, database `dayfold_v2`
- New-user local test app: `http://127.0.0.1:3002`, database `dayfold_test`

Keep using `npm run dev:test` for the 3002 test environment.
