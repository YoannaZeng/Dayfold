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

## First Deploy Sequence

1. Create a production PostgreSQL database.
2. Set the three production environment variables above.
3. Run the environment check locally or in CI with the production values available:

```bash
NODE_ENV=production npm run verify:deploy-env
```

4. Run the full Phase C preflight with production values available:

```bash
NODE_ENV=production npm run verify:phaseC
```

5. Apply database migrations to the production database:

```bash
./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
```

Before running this command, double-check that the active `DATABASE_URL` is the production database. Do not run `migrate reset` against production.

6. Use this build command on Vercel:

```bash
npm run vercel-build
```

7. After deploy, open:

```bash
https://your-production-domain.com/api/health
```

Expected result:

```json
{ "ok": true, "service": "dayfold", "database": "reachable" }
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
