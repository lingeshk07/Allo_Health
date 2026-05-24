# Allo Inventory — Engineering Take-Home

A multi-warehouse inventory reservation system built with Next.js, Prisma, and PostgreSQL. Customers can browse products, reserve units with a 10-minute hold, then confirm or cancel their reservation.

---

## Tech Stack

- **Next.js 16** (App Router, TypeScript)
- **Prisma** — ORM and migrations
- **PostgreSQL** — hosted on Neon / Supabase
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
npm run db:generate
npm run db:push
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
| GET | `/api/products` | List products with stock per warehouse |
| GET | `/api/warehouses` | List warehouses |
| POST | `/api/reservations` | Create a reservation (body: `{ inventoryId, quantity }`) |
| GET | `/api/reservations/:id` | Get a single reservation |
| POST | `/api/reservations/:id/confirm` | Confirm a reservation |
| POST | `/api/reservations/:id/release` | Release a reservation |
| GET | `/api/cron/expire-reservations` | Expire stale reservations (called by cron) |

**Error codes:**
- `409` — Not enough stock available
- `410` — Reservation has expired
- `404` — Reservation not found

---

## Concurrency Design

The core challenge: two concurrent requests for the last unit must not both succeed.

**Solution: PostgreSQL row-level locking via `SELECT FOR UPDATE`**

```sql
SELECT id, "totalQuantity", "reservedQuantity"
FROM "Inventory"
WHERE id = $1
FOR UPDATE
```

All reservation logic runs inside a `prisma.$transaction()` block. The `FOR UPDATE` clause acquires an exclusive lock on the inventory row before reading it. Concurrent transactions queue behind the first one — the second reads the already-incremented `reservedQuantity` and correctly returns a 409.

This is stronger than optimistic concurrency (which needs retry loops) and doesn't require Redis for the core flow.

**Why not application-level locks?** In a multi-instance deployment (e.g. Vercel), each request can land on a different server. Database-level locks are the only reliable shared mutex.

Confirm, release, cron expiry, and lazy expiry cleanup also lock the reservation row before mutating inventory. That prevents double-confirm, double-release, or confirm-vs-expiry races from applying inventory changes more than once.

---

## Expiry Mechanism

Reservations are set to expire 10 minutes after creation (`expiresAt` field).

**Production: Vercel Cron Job**

`vercel.json` schedules `GET /api/cron/expire-reservations` every minute:

```json
{
  "crons": [{ "path": "/api/cron/expire-reservations", "schedule": "* * * * *" }]
}
```

The cron handler:
1. Queries for `status = PENDING AND expiresAt < NOW()`
2. For each expired reservation, runs a transaction that re-checks status (to avoid double-release) and decrements `reservedQuantity`
3. Marks status as `RELEASED`

**Development / alternative: lazy cleanup on read**

`GET /api/products` and `GET /api/reservations/:id` also release expired pending reservations before returning data. The cron job is still the production cleanup mechanism, but lazy cleanup keeps local development and product browsing accurate even between cron runs.

---

## Retry / Idempotency Behaviour

Pass an `Idempotency-Key` header when creating a reservation. The key is stored on the reservation row with a unique index. If a duplicate reserve request arrives with the same key, the existing reservation is returned without repeating the stock hold.

```bash
curl -X POST /api/reservations \
  -H "Idempotency-Key: order-abc-123" \
  -H "Content-Type: application/json" \
  -d '{"inventoryId": "...", "quantity": 1}'
```

Confirm and release are safe to retry after success: if the reservation is already confirmed or already released, the endpoint returns the settled reservation instead of applying the inventory change again.

---

## Trade-offs & What I'd Do Differently

**What's here:**
- Race-condition-safe reservations via `SELECT FOR UPDATE`
- Confirm / release / expiry flows with guarded inventory mutation
- Live UI updates (no manual refresh)
- 409 / 410 errors surfaced to the user
- Idempotency key support for reservation creation
- Vercel Cron for expiry

**What I'd add with more time:**
- **Redis distributed lock** as a fast pre-check before hitting the DB (reduces lock contention at scale)
- **Optimistic UI updates** with SWR or React Query for polling reservation status
- **User sessions** — right now reservations aren't scoped to a user
- **Quantity selection** — currently hardcoded to 1 unit
- **Email/SMS notification** on reservation expiry
- **Admin dashboard** for inventory management
- **Unit + integration tests** for the concurrency logic
- **Full response-record idempotency** for every POST endpoint

**Known limitations:**
- Cron granularity is 1 minute on Vercel free tier; expired reservations may linger up to 59 seconds
- No authentication — anyone can confirm/release any reservation by ID
