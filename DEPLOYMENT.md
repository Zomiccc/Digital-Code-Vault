# Production Deployment Guide

This document is the single source of truth for deploying the Digital Code Vault
platform (API + Admin + Merchant + Portal) to a real production environment.

## 1. Services required

| Service    | Requirement                                             |
|------------|----------------------------------------------------------|
| PostgreSQL | 14+ (required in production — SQLite is dev-only)        |
| Redis      | 6+ (required in production — in-memory fallback is dev-only) |
| SMTP / SendGrid / Resend | One real email provider configured        |
| Node.js    | 20+                                                       |

## 2. Install

```bash
npm install                # installs all workspaces (root, api, admin, merchant, portal)
```

`apps/api`'s `postinstall` script automatically runs `prisma/set-provider.js`
(which switches `schema.prisma` to `postgresql` based on `DATABASE_URL`) and
`prisma generate`. **`DATABASE_URL` must already be set in the environment
before running `npm install`**, or the Prisma client will be generated for the
wrong database provider.

## 3. Build

```bash
npm run build               # builds shared package, api, admin, merchant, portal
```

Frontend builds (`admin`, `merchant`, `portal`) read `VITE_API_URL` at **build
time** (Vite bakes it into the static bundle). Set it before building:

```bash
# If API and frontend share the same origin (e.g. behind the bundled Caddy
# reverse proxy), you can leave VITE_API_URL unset — it falls back to the
# relative path "/api/v1".
export VITE_API_URL=https://api.yourdomain.com/api/v1
npm run build:admin
npm run build:merchant
npm run build:portal
```

If `VITE_API_URL` is not set, `vite build` prints an explicit warning
(`apps/admin/vite.config.ts`, `apps/merchant/vite.config.ts`) so this is never
a silent misconfiguration.

## 4. Database migration

```bash
cd apps/api
DATABASE_URL=postgresql://... npm run prisma:migrate:deploy
```

or from the repo root:

```bash
npm run db:migrate:deploy
```

This runs `prisma/set-provider.js` (locks the schema to `postgresql`) followed
by `prisma migrate deploy`, which applies `apps/api/prisma/migrations/*` without
prompting and **never resets or drops data**. The committed migration history
(`20260824000000_init_postgresql`) is PostgreSQL-dialect SQL, generated
specifically for production. Do not run `prisma migrate dev` in production —
it is a development-only command that can create a shadow database and prompt
interactively.

> Local development uses SQLite (`file:./dev.db`) via `prisma db push`. The
> migration history in `prisma/migrations` is PostgreSQL-only and is meant
> exclusively for production deploys.

## 5. Start

```bash
cd apps/api
NODE_ENV=production node dist/main.js
```

or from the repo root after building: `node apps/api/dist/main.js` with the
working directory set to `apps/api` (Prisma resolves `schema.prisma` and
`.env` relative to `apps/api`).

On boot, `main.ts` loads environment variables and calls
`validateProductionEnv()` **before** `NestFactory.create()` runs — so a
misconfigured production environment fails fast, before any database
connection, Redis connection, or admin-bootstrap logic executes.

## 6. Required environment variables

### `apps/api/.env` (backend)

| Variable | Required in prod | Notes |
|---|---|---|
| `NODE_ENV` | yes | must be `production` |
| `PORT` | no | defaults to `3000` |
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | yes | `redis://host:6379` (or `rediss://` for TLS) |
| `JWT_SECRET` | yes | random string, no dev defaults allowed |
| `JWT_REFRESH_SECRET` | yes | random string, no dev defaults allowed |
| `ENCRYPTION_KEY` | yes | 64 hex chars (32 bytes) — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `CORS_ORIGIN` | yes | comma-separated production origins, no `*`, no `localhost` |
| `APP_URL` | yes | public API URL, e.g. `https://api.yourdomain.com` |
| `EMAIL_PROVIDER` | yes | `sendgrid` \| `resend` \| `smtp` |
| `SENDGRID_API_KEY` | if provider=sendgrid | |
| `SENDGRID_FROM_EMAIL` / `SENDGRID_FROM_NAME` | optional | |
| `RESEND_API_KEY` | if provider=resend | |
| `RESEND_FROM_EMAIL` | optional | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | if provider=smtp | |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | recommended | only used if no admin exists yet; never overwrites an existing admin |
| `WEBHOOK_MAX_RETRIES` | no | default `8` |
| `EMAIL_DIGEST_WINDOW_SECONDS` | no | default `90` — batches multiple order emails per customer |

### `apps/admin/.env`, `apps/merchant/.env`, `apps/portal/.env` (frontend, build-time only)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | recommended | full API base, e.g. `https://api.yourdomain.com/api/v1`. Leave unset only if served from the same origin as the API. |

## 7. Verified locally (this environment)

The following were actually executed and confirmed during production-readiness
verification (not just reviewed):

- `ProductionConfigValidator` runs before any Nest module initializes;
  confirmed via log ordering in a `NODE_ENV=production` boot test.
- API boots with a full set of real-format production env vars, passes
  validation, and then attempts a genuine PostgreSQL connection (fails only
  because no local Postgres server exists in this sandbox — expected).
- Admin login, authenticated request, and refresh token flow tested against
  the real existing admin account — password was not reset.
- Single-code order (PSN $10): allocated → decrypted → revealed a single
  non-empty, non-duplicate code → digest email sent via SendGrid (`SENT`).
- Multi-code Essentials order (PSN $30 → $20 + $10 combination): allocated →
  revealed two distinct non-empty codes → digest email sent via SendGrid
  after the batching window elapsed.
- `vite build` for `admin` correctly embeds `VITE_API_URL` into the output
  bundle when set, and prints a warning when it is not set.
- The previously committed Prisma migrations were SQLite-only (`PRAGMA`,
  `DATETIME`) and would have failed against real PostgreSQL. Regenerated as
  `prisma/migrations/20260824000000_init_postgresql` (verified with
  `prisma validate` and `prisma generate` against a PostgreSQL provider).

## 8. Known limitations of this verification

- No live PostgreSQL or Redis server was available in this sandbox (no
  Docker), so `prisma migrate deploy` and a full BullMQ/Redis connection could
  not be executed end-to-end against real infrastructure. Redis code paths
  were verified by review: `RedisService` and `WebhookService` fall back to
  an in-memory queue with a logged warning if Redis is unreachable — they do
  not silently report success as if Redis were connected. Run
  `npm run db:migrate:deploy` against your real production database before
  going live, and confirm it completes without errors.
- The merchant login credentials provided during testing did not match any
  account in the current database, so the merchant-side JWT login flow was
  not re-verified in this session (admin login/refresh was). The underlying
  merchant login code path is identical to the verified admin path
  (`AuthService.merchantLogin` / `merchantRefresh`).
