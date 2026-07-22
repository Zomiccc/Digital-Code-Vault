# Digital Code Vault — Security Verification Guide

## How to Verify Each Security Claim

This guide provides step-by-step tests your client can perform to verify every security claim.

---

## Test 1: Codes Are Encrypted at Rest

**Claim:** Codes are AES-256-GCM encrypted — even database access won't reveal them.

**How to verify:**
1. Open the SQLite database directly:
   ```
   cd apps/api
   npx prisma studio
   ```
2. Navigate to the `CodeItem` table
3. Look at the `encryptedCode` column — you will see strings like:
   ```
   a1b2c3d4:5e6f7a8b:c9d0e1f2a3b4c5d6...
   ```
   These are `iv:authTag:ciphertext` — encrypted data, NOT plaintext codes.
4. Try to find any readable code — you won't. Every single code is encrypted.

**Alternative:** Open `dev.db` with any SQLite browser:
```
sqlite3 apps/api/dev.db "SELECT encryptedCode FROM CodeItem LIMIT 5;"
```
All entries are ciphertext.

---

## Test 2: One-Time Code Reveal (No Double Access)

**Claim:** Once a code is revealed, it can NEVER be revealed again.

**How to verify:**
1. Create a fulfillment order (via API or merchant dashboard)
2. Get the delivery link URL: `http://localhost:3000/api/v1/d/{token}`
3. Open the link in browser — you'll see product info, click "Reveal Code"
4. **Copy the code** — this is your only chance
5. **Refresh the page** or open the same link again
6. You will see: "Already Revealed" — the code is NOT shown again
7. Check the database:
   ```
   sqlite3 apps/api/dev.db "SELECT status, revealedAt FROM CodeItem WHERE id IN (SELECT value FROM json_each((SELECT codeItemIds FROM Allocation LIMIT 1));"
   ```
   Status will be `DELIVERED` with a `revealedAt` timestamp.

**What this proves:** Two people cannot access the same code — first person wins, second person gets nothing.

---

## Test 3: Concurrent Access Protection (Race Condition Test)

**Claim:** Two simultaneous requests for the same code cannot both succeed.

**How to verify:**
1. Create a fulfillment order with amount that requires codes
2. Open two terminal windows
3. Run both commands at the EXACT same time:
   ```bash
   # Terminal 1
   curl -X POST http://localhost:3000/api/v1/fulfillment \
     -H "Content-Type: application/json" \
     -H "X-Api-Key: YOUR_KEY" \
     -H "X-Signature: SIG" \
     -H "X-Timestamp: TS" \
     -d '{"merchant_id":"...","product_id":"...","amount":10,"currency":"USD","reference_id":"RACE_TEST_1","idempotency_key":"key_1"}'

   # Terminal 2 (same request, different idempotency key)
   curl -X POST http://localhost:3000/api/v1/fulfillment \
     -H "Content-Type: application/json" \
     -H "X-Api-Key: YOUR_KEY" \
     -H "X-Signature: SIG" \
     -H "X-Timestamp: TS" \
     -d '{"merchant_id":"...","product_id":"...","amount":10,"currency":"USD","reference_id":"RACE_TEST_2","idempotency_key":"key_2"}'
   ```
4. Only ONE will succeed (gets the code). The other will get `INSUFFICIENT_STOCK` error.
5. Check: each code in the database has a unique status — no code is allocated to two orders.

**What this proves:** Atomic database transactions prevent double-allocation.

---

## Test 4: API Request Tampering Detection (HMAC)

**Claim:** Any modification to an API request invalidates it.

**How to verify:**
1. Create an API key from the merchant dashboard
2. Make a valid API request with correct HMAC signature — it succeeds
3. Now change ONE character in the request body and resend with the same signature
4. You will get: `401 Unauthorized — INVALID_SIGNATURE`
5. Change the timestamp to 10 minutes ago — you will get: `401 Unauthorized — TIMESTAMP_EXPIRED`

**What this proves:** Man-in-the-middle attacks cannot tamper with requests.

---

## Test 5: Replay Attack Prevention

**Claim:** Captured API requests cannot be replayed.

**How to verify:**
1. Capture a valid API request (headers + body + timestamp)
2. Wait 6 minutes
3. Resend the exact same request
4. You will get: `401 Unauthorized — TIMESTAMP_EXPIRED`
5. The 5-minute timestamp window ensures stale requests are rejected

---

## Test 6: Idempotency (No Double-Charge)

**Claim:** Duplicate requests with the same idempotency key return the original response.

**How to verify:**
1. Create a fulfillment request with `idempotency_key: "test-key-123"`
2. Note the response (fulfillment ID, allocated codes)
3. Send the SAME request again with the same `idempotency_key: "test-key-123"`
4. You will get the EXACT SAME response — same fulfillment ID, same codes
5. Check the wallet — it was only debited ONCE

**What this proves:** Network retries and duplicate submissions cannot cause double-charges.

---

## Test 7: Rate Limiting

**Claim:** Excessive API requests are blocked.

**How to verify:**
1. Send 130+ requests rapidly to any API endpoint:
   ```bash
   for i in $(seq 1 130); do
     curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/products \
       -H "X-Api-Key: YOUR_KEY" -H "X-Signature: SIG" -H "X-Timestamp: TS"
   done
   ```
2. After 120 requests, you will start seeing `429 Too Many Requests`
3. Wait 60 seconds — requests work again

---

## Test 8: Audit Trail (Every Action Logged)

**Claim:** All sensitive actions are logged with full details.

**How to verify:**
1. Login as admin, create a merchant, upload codes, reveal a code
2. Check audit logs:
   ```
   sqlite3 apps/api/dev.db "SELECT actorType, action, entity, ip, createdAt FROM AuditLog ORDER BY createdAt DESC LIMIT 20;"
   ```
3. You will see entries for: `admin.login`, `codes.bulk_upload`, `codes.reveal`, `delivery.revealed`, etc.
4. Each entry has: who did it, what they did, when, and from which IP

**What this proves:** Complete forensic trail — nothing happens unlogged.

---

## Test 9: API Key Revocation

**Claim:** Revoked API keys stop working immediately.

**How to verify:**
1. Create an API key — test it works
2. Revoke it from the merchant dashboard
3. Try to use the same key again
4. You will get: `401 Unauthorized — INVALID_API_KEY`

---

## Test 10: Wallet Transaction Integrity

**Claim:** Wallet debits and code allocations are atomic — no partial states.

**How to verify:**
1. Note merchant wallet balance (e.g., $10,000)
2. Create a fulfillment for $50
3. Check wallet: $9,950 (debited)
4. Admin reverses the fulfillment
5. Check wallet: $10,000 (refunded)
6. Check codes: status back to `AVAILABLE`

**What this proves:** Money and codes are always in sync — no glitch can cause free codes or lost funds.

---

## Test 11: Delivery Token Security

**Claim:** Delivery tokens are hashed and expire.

**How to verify:**
1. Create a fulfillment — get delivery link
2. Check the database:
   ```
   sqlite3 apps/api/dev.db "SELECT tokenHash, expiresAt, revealedAt FROM DeliveryToken LIMIT 5;"
   ```
3. The `tokenHash` is a SHA-256 hash — the raw token is NOT stored
4. Even with database access, you cannot reconstruct the delivery URL
5. Wait for expiry (or set short expiry) — the link stops working

---

## Test 12: Input Validation (No Injection)

**Claim:** All inputs are validated — no SQL injection or mass assignment.

**How to verify:**
1. Send a request with extra unexpected fields:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/admin/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@digitalcode.local","password":"Admin123!@#","role":"SUPER_ADMIN","isAdmin":true}'
   ```
2. The extra fields (`role`, `isAdmin`) are silently stripped — only `email` and `password` are accepted
3. Try SQL injection in email:
   ```bash
   curl -X POST http://localhost:3000/api/v1/auth/admin/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@digitalcode.local OR 1=1 --","password":"x"}'
   ```
4. Returns `401 Unauthorized` — Prisma uses parameterized queries, injection is impossible

---

## Summary Checklist

| # | Security Claim | Verified By |
|---|---------------|-------------|
| 1 | Codes encrypted at rest | Inspect database — all ciphertext |
| 2 | One-time reveal | Reveal code, refresh — "Already Revealed" |
| 3 | No concurrent access | Two simultaneous requests — only one wins |
| 4 | No request tampering | Modify body — signature fails |
| 5 | No replay attacks | Old timestamp — rejected |
| 6 | No double-charge | Same idempotency key — same response |
| 7 | Rate limiting | 120+ requests — 429 error |
| 8 | Audit trail | Database shows all actions with IP |
| 9 | Key revocation | Revoked key — 401 error |
| 10 | Wallet integrity | Reverse fulfillment — refund + code release |
| 11 | Token security | Database shows hash, not raw token |
| 12 | Input validation | Extra fields stripped, injection fails |

---

*Every security claim in Digital Code Vault is independently verifiable. No black boxes.*
