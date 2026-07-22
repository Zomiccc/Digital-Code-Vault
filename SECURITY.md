# Digital Code Vault — Security Architecture Overview

## Executive Summary

Digital Code Vault is built with enterprise-grade security at every layer. From AES-256-GCM encryption at rest to HMAC-signed API requests, the system is designed to protect high-value digital codes against unauthorized access, tampering, and interception.

---

## Security Layers

### 1. Encryption at Rest (AES-256-GCM)

- All digital codes are encrypted using **AES-256-GCM** (Galois/Counter Mode) — the same encryption standard used by banks and government agencies.
- Each code is encrypted with a unique IV (Initialization Vector) and authenticated with a GCM auth tag, ensuring both **confidentiality** and **integrity**.
- The encryption key never leaves the server and is loaded from environment variables at startup.
- Codes cannot be read from the database — even with direct database access, the data is ciphertext.

### 2. One-Time Code Reveal

- Delivery tokens are **one-time use only** — once a customer reveals their code, it can never be revealed again.
- Reveal attempts are logged with IP address, timestamp, and customer identity.
- After reveal, code status changes to `DELIVERED` and the code is permanently consumed.

### 3. API Authentication — HMAC Signature Verification

Every API request requires three headers:
- `X-Api-Key` — merchant API key identifier
- `X-Signature` — HMAC-SHA256 signature of the request
- `X-Timestamp` — request timestamp (rejects replay attacks within 5-minute window)

The signature is computed as:
```
HMAC-SHA256(api_key, "METHOD\nPATH\nBODY\nTIMESTAMP")
```

This ensures:
- **No tampering** — any change to the request body invalidates the signature
- **No replay attacks** — expired timestamps are rejected
- **No key interception** — the API key is never transmitted in plaintext (it's hashed with Argon2)

### 4. API Key Security

- API keys are stored as **Argon2 hashes** (memory-hard, GPU-resistant password hashing).
- Key prefixes are stored for lookup; full keys are only shown once at creation time.
- Keys can be **revoked instantly** with full audit logging.
- Scope-based access control (`fulfillment`, `read`) limits what each key can do.

### 5. JWT Authentication with Refresh Tokens

- Admin and merchant dashboards use **JWT access tokens** (15-minute expiry).
- **Refresh tokens** (7-day expiry) allow seamless session renewal without re-login.
- Tokens are signed with separate secrets (access vs. refresh).
- Role-based access control (RBAC) with `SUPER_ADMIN`, `ADMIN`, `INVENTORY_MANAGER` roles.

### 6. Rate Limiting

- API requests are rate-limited per API key (120 requests/minute default).
- IP-based rate limiting for auth endpoints (60 requests/minute).
- Sliding window algorithm prevents burst attacks.

### 7. Idempotency Protection

- All POST/PUT/PATCH requests support idempotency keys.
- Duplicate requests return the original response — no double-charges or double-allocations.
- Cached responses expire after 24 hours.

### 8. Audit Logging

- Every sensitive action is logged: logins, code reveals, fulfillments, wallet transactions, API key creation/revocation, admin actions.
- Logs include actor type, actor ID, action, entity, IP address, and metadata.
- Immutable audit trail for compliance and forensic analysis.

### 9. Wallet & Transaction Integrity

- All financial operations execute within **database transactions**.
- Wallet debits and code allocations are atomic — either both succeed or both roll back.
- Full transaction history with balance tracking.
- Admin can reverse fulfillments with automatic wallet refunds.

### 10. Delivery Token Security

- Delivery tokens are **hashed** (SHA-256) before storage — the raw token is only shown once.
- Tokens have configurable expiry (default: 7 days).
- Tokens are bound to specific fulfillment requests — no reuse across orders.

### 11. HTTP Security Headers

- **Helmet.js** sets security headers: HSTS, X-Content-Type-Options, X-Frame-Options, etc.
- **CORS** restricted to configured origins only.
- Content Security Policy disabled for API (enabled for frontends in production).

### 12. Input Validation

- All API inputs validated with **class-validator** (whitelist mode).
- Unknown properties are rejected (no mass assignment vulnerabilities).
- Request bodies are transformed and type-checked before reaching business logic.

---

## Security Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │  Admin   │  │ Merchant │  │  Portal  │  │  API     │   │
│  │  Dashboard│  │ Dashboard│  │ (Customer)│  │  Client  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │  JWT         │  JWT       │  Token    │  HMAC     │
│       │  Auth        │  Auth      │  Auth     │  Sign     │
└───────┼──────────────┼───────────┼──────────┼────────────┘
        │              │           │          │
┌───────▼──────────────▼───────────▼──────────▼────────────┐
│                     API Gateway Layer                     │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Rate Limiting → CORS → Helmet → Input Validation  │ │
│  └─────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Auth Guard → Scope Check → Idempotency Check       │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────┐
│                    Business Logic Layer                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Encryption│  │  Wallet  │  │ Allocation│  │  Audit   │ │
│  │ Service   │  │  Engine  │  │  Engine   │  │  Logger  │ │
│  │ AES-256   │  │ Tx-safe  │  │  Atomic   │  │  Immutable│ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────────────────┘
        │
┌───────▼─────────────────────────────────────────────────┐
│                    Data Layer (SQLite)                    │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Encrypted Codes │ Hashed Tokens │ Hashed API Keys  │ │
│  │  (AES-256-GCM)   │ (SHA-256)     │ (Argon2)         │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Compliance & Best Practices

| Standard | Implementation |
|----------|---------------|
| Encryption at rest | AES-256-GCM for all sensitive data |
| Key management | Environment-based secrets, never in code |
| Password hashing | Argon2 (OWASP recommended) |
| API authentication | HMAC-SHA256 + timestamp window |
| Token security | SHA-256 hashed, one-time use, expiry-bound |
| Audit trail | Complete immutable logging of all actions |
| Transaction integrity | ACID database transactions |
| Input validation | Whitelist-based, no mass assignment |
| Rate limiting | Per-key and per-IP sliding window |
| CORS | Restricted to configured origins |
| Security headers | HSTS, X-Frame-Options, X-Content-Type-Options |

---

## What This Means for Your Clients

1. **Codes are never stored in plaintext** — even a full database breach reveals only encrypted ciphertext.
2. **API requests cannot be tampered with** — HMAC signatures ensure request integrity.
3. **Double-spending is impossible** — idempotency keys and atomic transactions prevent duplicate charges.
4. **Every action is traceable** — complete audit logs for compliance and dispute resolution.
5. **Access is scoped and revocable** — API keys have limited scopes and can be revoked instantly.
6. **Delivery links are one-time use** — codes can only be revealed once, then they're consumed forever.

---

*Digital Code Vault — Security by Design.*
