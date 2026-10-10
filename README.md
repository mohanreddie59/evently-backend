# Evently backend (proper edition)

A production-shaped REST API for the Evently event-management & volunteer
portal: real **SQLite** persistence, **salted+hashed passwords**,
**bearer-token sessions**, and **role-based access control** (`host` /
`volunteer` / `admin`). Still **zero npm dependencies** — it uses Node's
built-in `node:sqlite` (stable enough for this; see note below) and
`node:crypto`, so `node server.js` is all you need.

This supersedes the earlier "prototype" backend (in-memory JSON file, no
auth). Use this one as the real foundation; use that one only as a
reference for the simplest possible version of the flow.

## Run it

```bash
node --no-warnings server.js
# Evently backend (proper) listening on http://localhost:4000
```

`node:sqlite` is still flagged *experimental* by Node itself (harmless —
it just prints a warning); `--no-warnings` silences that. Needs **Node
22.5+** (uses `node:sqlite`, available without a flag from that version).
Change the port with `PORT=5000`. Point at a different DB file with
`DB_PATH=/path/to/file.db`.

## Architecture

```
evently-backend-pro/
├── server.js                 # HTTP server + route registration
├── src/
│   ├── router.js              # tiny dependency-free router (params, JSON body, CORS, errors)
│   ├── db/
│   │   ├── schema.sql          # tables, constraints, indexes
│   │   └── index.js            # opens the SQLite file, applies schema on boot
│   ├── utils/
│   │   ├── password.js         # scrypt hashing + timing-safe verify
│   │   ├── tokens.js           # session token generate/hash
│   │   └── validate.js         # small hand-rolled input validators
│   ├── middleware/
│   │   └── auth.js             # auth()/role() handler-wrapping middleware
│   ├── services/
│   │   ├── userService.js      # register/login/logout/session lookup
│   │   └── eventService.js     # event lifecycle + ownership rules
│   └── routes/
│       ├── auth.js
│       ├── events.js
│       └── admin.js
└── data/evently.db            # created on first run
```

Each layer only talks to the one below it — routes call services, services
touch the database — so swapping SQLite for Postgres later means editing
`src/db/` and the two files in `src/services/`, nothing else.

## Auth model

- **Passwords**: salted with `crypto.randomBytes`, hashed with `scrypt`,
  compared with `crypto.timingSafeEqual`. Never stored in plaintext.
- **Sessions**: on register/login the server returns an opaque random
  token. Only its SHA-256 **hash** is stored server-side (`sessions`
  table) — the raw token is never persisted, same principle as how you'd
  store an API key. Sessions expire after 7 days. Send it back as
  `Authorization: Bearer <token>`.
- **Roles**: `host`, `volunteer`, `admin`, fixed at registration. Routes
  are gated with `role("host", handler)` / `auth(handler)` wrappers — see
  `src/middleware/auth.js`.

## Business rules enforced server-side

- A host can't claim their own event.
- Only the assigned volunteer can mark an event completed — and only
  **after** the fee is marked paid.
- Only the event's host can pay its fee or rate it, and only once it's
  in the right state (`assigned` to pay, `completed` to rate).
- A host can cancel their own event only while it's still `open`; an
  admin can cancel any event.
- All of this is enforced in `src/services/eventService.js`, independent
  of the HTTP layer — so it holds even if you add another transport
  (GraphQL, gRPC, whatever) later.

## API reference

All responses are JSON. Errors: `{"error": "message"}` with a 4xx/5xx
status matching what went wrong (400 bad input, 401 no/expired session,
403 wrong role or not the owner, 404 missing, 409 wrong state for the
action).

### Auth

| Method | Path | Body | Auth | Description |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{name, email, password, role, adminCode?}` | — | Create an account (`role`: host/volunteer/admin; `admin` also needs `adminCode` matching the server's `ADMIN_SIGNUP_CODE`). Returns `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` | — | Returns `{token, user}` |
| POST | `/api/auth/logout` | — | Bearer | Invalidates the current token |
| GET | `/api/auth/me` | — | Bearer | Current user |

### Events

| Method | Path | Body | Auth | Description |
|---|---|---|---|---|
| GET | `/api/events` | — | — | List events. `?status=open\|assigned\|completed\|cancelled` and/or `?type=...` |
| GET | `/api/events/:id` | — | — | One event |
| POST | `/api/events` | `{title, type, date, location, budget}` | host | Create (status starts `open`) |
| POST | `/api/events/:id/claim` | — | volunteer | Claim an open event → `assigned`, fee calculated (5% of budget, min ₹99) |
| POST | `/api/events/:id/pay` | — | host (owner) | Mark the fee paid |
| POST | `/api/events/:id/complete` | — | volunteer (assignee) | → `completed`, requires fee paid |
| POST | `/api/events/:id/rate` | `{rating: 1-5}` | host (owner) | Rate a completed event |
| POST | `/api/events/:id/cancel` | — | host (owner, if still open) or admin (any state) | → `cancelled` |

### Admin

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/admin/stats` | admin | `{totalEvents, open, assigned, completed, cancelled, feeRevenue, averageRating}` |

### Example session

```bash
# Register a host
curl -X POST localhost:4000/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Asha Rao","email":"asha@example.com","password":"hunter222","role":"host"}'
# -> { "token": "...", "user": {...} }

# Post an event (use the token above)
curl -X POST localhost:4000/api/events -H "Content-Type: application/json" \
  -H "Authorization: Bearer <host_token>" \
  -d '{"title":"Birthday bash","type":"Birthday","date":"2026-12-01","location":"Pune","budget":10000}'

# A volunteer claims it
curl -X POST localhost:4000/api/events/<id>/claim -H "Authorization: Bearer <volunteer_token>"

# Host pays, volunteer completes, host rates
curl -X POST localhost:4000/api/events/<id>/pay -H "Authorization: Bearer <host_token>"
curl -X POST localhost:4000/api/events/<id>/complete -H "Authorization: Bearer <volunteer_token>"
curl -X POST localhost:4000/api/events/<id>/rate -H "Authorization: Bearer <host_token>" \
  -H "Content-Type: application/json" -d '{"rating":5}'
```

## Verified

The full flow above (register all three roles → create → claim → the
`complete`-before-`pay` rejection → pay → complete → rate → admin
stats → cancel) was run end-to-end against the real router and a real
SQLite file, including checking that the data survives a fresh process
restart. All status codes, role gates, and state-transition guards
behaved as documented.

## Deploy to Render

1. Push this folder to a GitHub repo (the `.gitignore` already keeps the
   database file and secrets out).
2. In Render: **New → Blueprint**, pick the repo. It reads `render.yaml`
   and creates the web service plus a 1 GB persistent disk mounted at
   `/var/data`, where the SQLite file lives (`DB_PATH`).
3. Render auto-generates `ADMIN_SIGNUP_CODE`. Copy it from the service's
   **Environment** tab; you need it to create your admin account:
   ```bash
   curl -X POST https://<your-service>.onrender.com/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"name":"You","email":"you@example.com","password":"a-long-password","role":"admin","adminCode":"<the code>"}'
   ```
4. Check `https://<your-service>.onrender.com/api/health`.

Notes:
- Persistent disks need a **paid** Render web service (Starter or above);
  free web services have an ephemeral filesystem, so the database would
  reset on every restart or redeploy.
- A service with a disk can't run multiple instances, and redeploys
  briefly stop the old instance before starting the new one (short
  downtime). Fine for this scale.
- Without `ADMIN_SIGNUP_CODE` set, nobody can register as admin.
- Check Render's pricing page for current rates.

## Still worth adding before a real deployment

- **Rate limiting** on `/api/auth/login` (brute-force protection).
- **HTTPS termination** (put it behind nginx/Caddy or a platform that
  does this for you — this server speaks plain HTTP).
- **A real payment gateway** (Razorpay/Stripe) wired into `/pay`,
  triggered by a verified webhook rather than a bare client call.
- **Structured logging** and request IDs for production debugging.
- **Migrating off `node:sqlite`** to Postgres/MySQL if you expect
  concurrent write volume beyond a single small server, or want managed
  backups/replication.
