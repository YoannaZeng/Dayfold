# Dayfold v2

`app-v2` is the new implementation baseline.

Rules:

- Use `prototype-progress.html`, `prototype-progress.css`, and `prototype-progress.js` as the only product reference.
- Do not inherit product logic from `app-v1`.
- `app-v1` is deprecated and kept only as an old engineering artifact.

Current status:

- Next.js app scaffolded from scratch for the new product direction
- Phase 1 backend data layer implemented with Prisma + PostgreSQL schema
- Day view and week view now read/write through `/api/state` and `/api/mutate`
- Browser `localStorage` persistence has been removed from the main product path
- Phase 1.5 hardening adds explicit progress entry source typing and a smoke-check script
- Phase 2.1 adds real user accounts, password-based sign-in, and cookie sessions
- Phase 2.2 adds save feedback, toast/error messaging, and loading state polish
- Phase 2.3 adds optimistic updates across the main day/week editing flows
- Phase 2.4 starts hardening expired-session recovery and verification coverage
- Phase A deployment preflight adds production session-secret enforcement and migration cleanup for `updatedAt` defaults
- Phase B starts account hardening with DB-backed auth rate limits and password strength guidance

Phase 1.5 notes:

- `ProgressEntry` now distinguishes manual progress from auto-generated completion progress.
- The canonical Prisma baseline is a single clean init migration.
- If you had already run the earlier duplicate init migrations locally, do one reset before continuing:

```bash
./node_modules/.bin/prisma migrate reset --schema prisma/schema.prisma
./node_modules/.bin/prisma generate --schema prisma/schema.prisma
```

- After the app is running locally, you can run a quick end-to-end smoke check:

```bash
npm run verify:smoke
```

Phase 2 notes:

- Run the new Prisma migration before opening the app.
- Sign-up creates a clean user account. To intentionally claim old local demo data, set `DAYFOLD_CLAIM_LEGACY_DEMO_USER=true` before signing up.
- Local development can use the default session secret, but production must set `DAYFOLD_SESSION_SECRET` explicitly.
- When a cookie session expires, the client should bounce back to the login screen instead of staying in a broken error state.
- The smoke script now checks unauthenticated API protection, tomorrow/next-week copy flows, and full deletion semantics after a plan is removed.

Run locally:

1. Copy `.env.example` to `.env.local`
2. Fill in a real PostgreSQL `DATABASE_URL`
3. Keep a local `node_modules` inside `app-v2`. Do not point `app-v2/node_modules` at `app-v1`.
4. Run `npm run prisma:generate`
5. Run Prisma migration against your database
6. Start the app:

```bash
npm run dev
```

The default local preview now opens `http://127.0.0.1:3001` automatically after the dev server is reachable.

If preview cache ever gets wedged after larger environment changes, reset the local Next.js cache before restarting:

```bash
npm run dev:reset
```

Production preflight:

```bash
npm run prisma:generate
./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
npm run build
```

Production env must include:

- `DATABASE_URL`
- `DAYFOLD_SESSION_SECRET`
- `DAYFOLD_PUBLIC_ORIGIN`

Auth hardening:

- Login is rate-limited by IP and email.
- Sign-up is rate-limited by IP.
- Sign-up passwords must be at least 8 characters.

Verification:

```bash
npm run verify:quick
```

For a broader end-to-end smoke pass:

```bash
npm run build
npm run verify:phase2
```

Local test preview:

- Personal environment: `http://127.0.0.1:3001`, default `.next`, default `DATABASE_URL`
- New-user test environment: `http://127.0.0.1:3002`, `.next-test`, `dayfold_test`

```bash
npm run dev:test
```

Phase 3 kickoff:

- Phase 3.1: tighten verification and developer workflow so future feature work is safer and faster
- Phase 3.2: start the next product-facing slice from a stable base, instead of continuing ad-hoc Phase 2 patching
- Phase 3.3: add user-facing backup/export so personal data is easy to take away and keep safe
- Phase 3.4: add full restore/import so a backup can be written back into the current account

Phase C deployment prep:

- `npm run vercel-build` generates the Prisma client before `next build`.
- `npm run verify:phaseC` runs the build/schema check and production env check together.
- `npm run verify:deploy-env` checks production-only environment variables before deployment.
- `/api/health` confirms the deployed app can reach PostgreSQL.
- See `DEPLOYMENT.md` for the first public beta deployment checklist.
