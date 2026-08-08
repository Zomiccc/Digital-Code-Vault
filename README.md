# Digital Code Vault & Fulfillment Platform

A secure, production-grade platform for storing, managing, and fulfilling digital codes (gift cards, activation codes, PINs) with encrypted storage, wallet-based billing, and webhook-driven fulfillment.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Caddy Reverse Proxy                    │
│                   (auto-HTTPS, routing)                   │
├──────────┬──────────┬──────────┬──────────┬──────────────┤
│  /api/*  │ /admin/* │/merchant │   /d/*   │      /       │
│          │          │    /*    │          │              │
▼          ▼          ▼          ▼          ▼              │
┌─────┐  ┌──────┐  ┌─────────┐ ┌──────┐  ┌───────┐        │
│ API │  │ Admin │  │Merchant │ │ API  │  │Portal │        │
│NestJS│  │React │  │ React   │ │(deliv)│  │React  │        │
└──┬──┘  └──────┘  └─────────┘ └──┬───┘  └───────┘        │
   │                               │                       │
   ▼                               ▼                       │
┌──────────┐              ┌──────────────┐                 │
│PostgreSQL│              │    Redis     │                 │
│ (Prisma) │              │  (BullMQ)    │                 │
└──────────┘              └──────────────┘                 │
```

## Tech Stack

- **Backend**: NestJS, Prisma ORM, PostgreSQL, Redis, BullMQ
- **Admin Dashboard**: React, Vite, TailwindCSS, React Query, Lucide Icons
- **Merchant Dashboard**: React, Vite, TailwindCSS, React Query
- **Customer Portal**: React, Vite, TailwindCSS (no router — token-based)
- **Reverse Proxy**: Caddy 2 (automatic HTTPS, security headers)
- **Encryption**: AES-256-GCM for code storage, Argon2id for passwords/API keys

## Project Structure

```
digitalcode/
├── apps/
│   ├── api/              # NestJS backend
│   │   ├── src/
│   │   │   ├── auth/         # JWT, API keys, HMAC signing, guards
│   │   │   ├── encryption/   # AES-256-GCM, masking, audit logging
│   │   │   ├── products/     # Product & denomination management
│   │   │   ├── codes/        # Bulk upload, code inventory, reveal
│   │   │   ├── fulfillment/  # Allocation engine, delivery tokens
│   │   │   ├── wallet/       # Merchant wallet, transactions
│   │   │   ├── merchants/    # Merchant CRUD, API key management
│   │   │   ├── admin/        # Admin dashboard, staff, suppliers
│   │   │   ├── webhooks/     # Webhook dispatch & retry queue
│   │   │   └── health/       # Health checks
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   └── Dockerfile
│   ├── admin/            # Admin dashboard (React)
│   ├── merchant/         # Merchant dashboard (React)
│   └── portal/           # Customer delivery portal (React)
├── packages/
│   └── shared/           # Shared types & utilities
├── Caddyfile             # Reverse proxy config
├── docker-compose.yml    # Full stack orchestration
└── .env.example          # Environment variables template
```

## Key Features

### Security
- **AES-256-GCM encryption** for all stored codes — codes are never stored in plaintext
- **Argon2id hashing** for passwords and API key secrets
- **HMAC-SHA256 request signing** for API authentication
- **JWT + refresh tokens** for dashboard authentication
- **Idempotency keys** to prevent duplicate fulfillment
- **Rate limiting** per API key (120 req/min) and per IP (60 req/min)
- **Audit logging** for all sensitive actions (code reveal, wallet credit, fulfillment)

### Fulfillment Engine
- **Denomination combination algorithm** — optimally selects codes to match requested amount
- **Reservation locks** with TTL (15 min) to prevent race conditions
- **Wallet debiting** with transactional integrity
- **Delivery tokens** (7-day expiry) for secure customer code retrieval
- **One-time reveal** — codes can only be viewed once per delivery token

### Webhooks
- **BullMQ-powered retry queue** with exponential backoff
- **8 retry attempts** over 24 hours
- **HMAC-signed payloads** for webhook authentication
- **Automatic status callbacks** for fulfillment lifecycle events

### Bulk Upload
- **Batch code ingestion** with deduplication
- **Encryption at rest** — codes encrypted before storage
- **Batch tracking** with unique batch IDs
- **Error reporting** with per-code failure details

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16+
- Redis 7+

### 1. Clone & Configure

```bash
git clone <repo-url> digitalcode
cd digitalcode
cp .env.example .env
```

### 2. Generate Secrets

```bash
# Encryption key (32 bytes hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Add these to your `.env` file.

### 3. Run with Docker Compose

```bash
docker compose up -d
```

This starts:
- PostgreSQL on port 5432
- Redis on port 6379
- API on port 3000
- Caddy on ports 80/443
- Admin, Merchant, and Portal frontends

### 4. Run Database Migration & Seed

```bash
# Install API dependencies first
cd apps/api && npm install

# Run Prisma migration
npx prisma migrate dev

# Seed initial data
npx prisma db seed
```

### 5. Development Mode (without Docker)

```bash
# Terminal 1: Start infrastructure
docker compose up postgres redis -d

# Terminal 2: Start API
cd apps/api && npm install && npm run start:dev

# Terminal 3: Start Admin Dashboard
cd apps/admin && npm install && npm run dev

# Terminal 4: Start Merchant Dashboard
cd apps/merchant && npm install && npm run dev

# Terminal 5: Start Customer Portal
cd apps/portal && npm install && npm run dev
```

## Default Seed Credentials

After running the seed script:

| Role    | Email                    | Password     |
|---------|--------------------------|--------------|
| Admin   | admin@digitalcode.local  | (from .env)  |
| Merchant| merchant@test.com       | Test1234!    |

## API Overview

### Authentication
- `POST /api/v1/auth/admin/login` — Admin login (JWT)
- `POST /api/v1/auth/merchant/login` — Merchant login (JWT)
- `POST /api/v1/auth/merchant/refresh` — Refresh token
- API key auth via `X-API-Key` header + HMAC signature

### Fulfillment (Merchant API)
- `POST /api/v1/fulfill` — Create fulfillment request
- `GET /api/v1/fulfill/:id` — Check fulfillment status
- `POST /api/v1/fulfill/:id/reverse` — Reverse fulfillment

### Delivery Portal (Public)
- `GET /d/:token` — Get delivery info (no auth, token-based)
- `POST /d/:token/reveal` — Reveal codes (one-time)

### Admin Dashboard API
- `GET /api/v1/admin/stats` — Dashboard statistics
- `GET /api/v1/admin/merchants` — List merchants
- `POST /api/v1/admin/merchants` — Create merchant
- `PATCH /api/v1/admin/merchants/:id/status` — Update merchant status
- `POST /api/v1/admin/merchants/:id/wallet/credit` — Credit wallet
- `GET /api/v1/admin/products` — List products
- `POST /api/v1/admin/products` — Create product
- `POST /api/v1/admin/products/:id/denominations` — Add denomination
- `GET /api/v1/admin/codes` — List codes (with filters)
- `POST /api/v1/admin/codes/bulk-upload` — Bulk upload codes
- `POST /api/v1/admin/codes/:id/reveal` — Reveal single code
- `POST /api/v1/admin/codes/:id/void` — Void a code
- `GET /api/v1/admin/fulfillment` — List all fulfillment requests
- `POST /api/v1/admin/fulfillment/:id/reverse` — Reverse fulfillment
- `GET /api/v1/admin/audit-logs` — View audit logs
- `GET /api/v1/admin/staff` — List staff members
- `POST /api/v1/admin/staff` — Create staff member

### Merchant Dashboard API
- `GET /api/v1/wallet` — Wallet balance & transactions
- `GET /api/v1/merchant/orders` — List fulfillment orders
- `GET /api/v1/products` — Available products
- `GET /api/v1/merchant/api-keys` — List API keys
- `POST /api/v1/merchant/api-keys` — Generate new API key
- `DELETE /api/v1/merchant/api-keys/:id` — Revoke API key

## Port Reference

| Service  | Dev Port | Docker Port |
|----------|----------|-------------|
| API      | 3000     | 3000        |
| Admin    | 5173     | 80 (Caddy)  |
| Merchant | 5174     | 80 (Caddy)  |
| Portal   | 5175     | 80 (Caddy)  |
| Postgres | 5432     | 5432        |
| Redis    | 6379     | 6379        |
| Caddy    | —        | 80/443      |

## License

Proprietary. All rights reserved.
