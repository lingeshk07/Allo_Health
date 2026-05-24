# Allo Inventory — Engineering Take-Home

A multi-warehouse inventory reservation system built with Next.js, Prisma, and PostgreSQL. Customers can browse products, reserve units with a 10-minute hold, then confirm or cancel their reservation.

Live URL: https://allo-health-roan.vercel.app (database is seeded with 5 products, 3 warehouses, and 12 inventory rows)

---

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Prisma** — ORM and migrations
- **PostgreSQL** — hosted on Neon
- **Tailwind CSS** — styling
- **Zod** — request validation
- **Vercel** — deployment + Cron Jobs

---

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd allo-inventory
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:
```
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
CRON_SECRET="your-random-secret"
```

Get a free PostgreSQL connection string from [Neon](https://neon.tech) or [Supabase](https://supabase.com).

### 3. Run migrations and seed

```bash
npm run db:push        # pushes schema to the database
npm run db:seed        # seeds 5 products, 3 warehouses, 12 inventory rows
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List products with available stock per warehouse |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/reservations` | Create a reservation (body: `{ inventoryId, quantity }`) |
| GET | `/api/reservations/:id` | Get a single reservation (added to support the checkout frontend) |
| POST | `/api/reservations/:id/confirm` | Confirm a reservation |
| POST | `/api/reservations/:id/release` | Release a reservation early |
| GET | `/api/cron/expire-reservations` | Expire stale reservations (called by Vercel Cron) |

**Error codes:**
- `409` — Not enough stock available (shown inline on the product listing page)
- `410` — Reservation has expired (shown on the checkout page when the user tries to confirm)
- `404` — Reservation not found

Note: `GET /api/reservations/:id` is not in the original spec but was added to power the checkout page — the frontend needs to fetch reservation details and status after creation.

---

## Concurrency Design

The core challenge: two concurrent requests for the last unit must not both succeed.

**Solution: atomic PostgreSQL CTE**

The reservation endpoint uses a single SQL statement that checks availability and creates the reservation atomically:

```sql
WITH updated_inventory AS (
  UPDATE "Inventory"
  SET "reservedQuantity" = "reservedQuantity" + $2,
      "updatedAt" = NOW()
  WHERE id = $1
    AND ("totalQuantity" - "reservedQuantity") >= $2
  RETURNING id
),
created_reservation AS (
  INSERT INTO "Reservation" (...)
  SELECT $3, id, $2, 'PENDING', $4, $5, NOW(), NOW()
  FROM updated_inventory
  RETURNING *
)
SELECT ... FROM created_reservation ...
```

The `UPDATE ... WHERE available >= requested` is atomic at the Postgres row level — only one concurrent transaction can win the update on a given inventory row. If no rows are updated (stock insufficient), the `INSERT` in the CTE produces no rows, and the handler returns a 409. This avoids the need for a separate `SELECT FOR UPDATE` lock and removes any gap between the read and the write.

**Why not application-level locks?** In a multi-instance deployment (e.g. Vercel), each request can land on a different server. Database-level atomicity is the only reliable shared mutex.

**Idempotency race handling:** if two requests arrive simultaneously with the same `Idempotency-Key`, the unique index on `idempotencyKey` causes one to throw a Postgres unique constraint error (P2002). The handler catches this and returns the already-created reservation instead of failing.

**Confirm, release, and expiry** also use atomic CTEs or `SELECT FOR UPDATE` transactions to guard inventory mutation — preventing double-confirm, double-release, or confirm-vs-expiry races from applying changes more than once.

---

## Expiry Mechanism

Reservations expire 10 minutes after creation (`expiresAt` field). There are two complementary cleanup mechanisms:

**1. Vercel Cron Job (production)**

`vercel.json` schedules `GET /api/cron/expire-reservations` once daily (Vercel Hobby plan limitation):

```json
{
  "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "0 0 * * *" }]
}
```

The cron handler:
1. Queries for `status = PENDING AND expiresAt < NOW()`
2. For each expired reservation, runs a `SELECT FOR UPDATE` transaction that re-checks the status (to avoid double-release) and decrements `reservedQuantity`
3. Marks status as `RELEASED`

**2. Lazy cleanup on read (development + between cron runs)**

Every call to `GET /api/products` automatically releases any expired pending reservations before returning stock data — so available quantities are always accurate when a customer is browsing, regardless of when the cron last ran. `GET /api/reservations/:id` does the same using a `SELECT FOR UPDATE` transaction to safely release an expired reservation before returning it to the checkout page.

This means in practice the app behaves correctly even on the Hobby plan — lazy cleanup on product browsing handles the gap between daily cron runs.

---

## Retry / Idempotency Behaviour

Pass an `Idempotency-Key` header when creating a reservation. The key is stored on the reservation row with a unique index. If a duplicate request arrives with the same key, the existing reservation is returned without repeating the stock hold.

```bash
curl -X POST /api/reservations \
  -H "Idempotency-Key: order-abc-123" \
  -H "Content-Type: application/json" \
  -d '{"inventoryId": "...", "quantity": 1}'
```

Confirm and release are safe to retry: if the reservation is already confirmed or already released, the endpoint returns the settled state instead of re-applying the inventory change.

---

## Frontend Behaviour

- **Product listing page** — shows all products with available stock per warehouse and a Reserve button. Out-of-stock entries are disabled. 409 errors (not enough stock) are shown inline next to the relevant warehouse row.
- **Checkout/reservation page** — shows reservation details, a live countdown timer that changes colour as expiry approaches, a Confirm button, and a Cancel button. After confirming or cancelling, the UI updates immediately without a manual page refresh. 410 errors (reservation expired) are shown when the user attempts to confirm after the timer runs out.

---

## Trade-offs & What I'd Do Differently

**What's here:**
- Race-condition-safe reservations via atomic Postgres CTE
- Confirm / release / expiry flows with guarded inventory mutation
- Lazy expiry cleanup on product browse and reservation fetch
- Live UI updates after confirm/cancel (no manual refresh)
- 409 / 410 errors surfaced to the user on both pages
- Idempotency key support for reservation creation with P2002 race handling
- Vercel Cron for scheduled expiry

**What I'd add with more time:**
- **Redis distributed lock** as a fast pre-check before hitting the DB (reduces lock contention at scale)
- **SWR or React Query** for polling reservation status on the checkout page
- **User sessions** — reservations are not currently scoped to a user
- **Quantity selection** — currently hardcoded to 1 unit
- **Email/SMS notification** on reservation expiry
- **Admin dashboard** for inventory management
- **Unit + integration tests** for the concurrency logic
- **Full response-record idempotency** for confirm and release endpoints (currently status-guard based, not stored-response based)

**Known limitations:**
- Cron runs once daily on Vercel Hobby; lazy cleanup on read fills the gap but there is no background worker running continuously
- No authentication — anyone can confirm/release any reservation by ID
- Cron expression in the original code was `* * * * *` (every minute), which requires Vercel Pro; changed to `0 0 * * *` for Hobby plan compatibility
