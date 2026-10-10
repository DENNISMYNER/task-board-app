# Task Board API

REST + realtime backend for a Trello/Linear-style task board.
**Stack:** Node.js 22 · Express 5 · TypeScript · PostgreSQL · Prisma 7 · Socket.io · Zod · JWT.

## Quick start

```bash
# 1. Install (this also runs `prisma generate` via the postinstall script)
npm install

# 2. Configure environment
cp .env.example .env
#    then set JWT_ACCESS_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Start PostgreSQL (Docker) and create the tables
docker compose up -d   # from the repo root
npx prisma migrate deploy            # applies the committed prisma/migrations/

# 4. Run the API with auto-reload
npm run dev                          # http://localhost:4000
```

Other scripts: `npm test` · `npm run typecheck` · `npm run build` · `npm start` · `npm run db:studio`

> **Production deploys** run `npm run db:deploy` (`prisma migrate deploy`), never `migrate dev`.

## Project structure

```
src/
  server.ts            process entry: HTTP server + Socket.io + graceful shutdown
  app.ts               builds the Express app (testable without opening a port)
  config/env.ts        Zod-validated environment variables (fails fast on bad config)
  lib/                 prisma client, jwt, errors, logger, fractional-position math
  middleware/          authenticate, errorHandler, rate limiters
  common/              shared request helpers + Zod schemas (uuid params, pagination)
  routes/index.ts      mounts every module under /api/v1
  modules/<feature>/   routes -> controller -> service (-> schema for validation)
    auth  workspaces  members  boards  columns  tasks  comments  activity  access
  realtime/            Socket.io: JWT handshake, board rooms, emitToBoard()
```

**Layering rule:** routes only wire URLs to controllers; controllers parse/validate input and shape
the response; services own business rules and database access. Only services touch Prisma.

## API (all under `/api/v1`, JSON)

Authenticated routes need `Authorization: Bearer <accessToken>`.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` |
| Workspaces | `GET/POST /workspaces` · `GET/PATCH/DELETE /workspaces/:id` |
| Members | `GET/POST /workspaces/:id/members` · `PATCH/DELETE /workspaces/:id/members/:userId` |
| Boards | `GET/POST /workspaces/:id/boards` · `GET/PATCH/DELETE /boards/:id` (DELETE archives) · `GET /boards/:id/activity` |
| Columns | `POST /boards/:id/columns` · `PATCH/DELETE /columns/:id` · `POST /columns/:id/move` |
| Tasks | `POST /boards/:id/tasks` · `GET/PATCH/DELETE /tasks/:id` · `POST /tasks/:id/move` · `GET /tasks/:id/activity` |
| Comments | `GET/POST /tasks/:id/comments` · `PATCH/DELETE /comments/:id` |

Health: `GET /health` (liveness) and `GET /ready` (checks the database).

### Drag and drop

```http
POST /api/v1/tasks/:taskId/move
{ "columnId": "<target column uuid>", "afterTaskId": "<task uuid or null for top>" }
```

The client says *where* the card was dropped (after which card), never a number. The server computes
the fractional `position` inside a transaction that locks the target column, so two people dropping
cards at the same moment can't collide. Columns use the same scheme: `POST /columns/:id/move`.

### Optimistic concurrency

`PATCH /tasks/:id` takes the `version` you last saw. If someone else edited first you get
`409` plus the current task, so the UI can merge or re-apply instead of silently overwriting.

### Errors

Every error has the same shape: `{ "error": { "code", "message", "details?", "requestId" } }`.
Validation failures are `400` with per-field `details`; unknown/unauthorised resources are `404`
(not `403`) so outsiders can't discover that a board exists.

## Realtime (Socket.io)

```ts
const socket = io("http://localhost:4000", { auth: { token: accessToken } });
socket.emit("board:join", { boardId }, (ack) => { /* ack.ok */ });
socket.on("task:moved", ({ boardId, actorId, data }) => { /* update UI */ });
```

Events: `board:updated`, `column:created|updated|moved|deleted`, `task:created|updated|moved|deleted`,
`comment:created|updated|deleted`. All share one envelope (`boardId`, `actorId`, `data`).

- The handshake verifies the JWT; `board:join` re-checks workspace membership, so only members receive events.
- Events are emitted **after the DB transaction commits**, so clients never see state that was rolled back.
- Write over REST, receive over sockets. A client ignores events where `actorId` is itself (it already applied them optimistically).
- Removing a member evicts their live sockets from the board rooms.
- To run more than one API instance, add the Socket.io Redis adapter.

## Security notes

- Passwords hashed with Argon2id. Login returns the same error for unknown email and wrong password.
- Access token: 15-minute JWT (HS256, algorithm pinned). Refresh token: opaque random value in an
  `HttpOnly`, `SameSite` cookie scoped to `/api/v1/auth`; only its SHA-256 hash is stored.
- Refresh tokens **rotate**; reusing an old one revokes the whole session family (theft detection).
- `helmet`, strict CORS origin, request body size limit. Rate limits: the whole API, failed login/refresh attempts (successful ones aren't counted, because the SPA refreshes on every page load), and account creation.
- Every query is scoped through the access service (workspace role checks), not just "is logged in".

## Testing

`npm test` runs the HTTP-layer and Socket.io handshake tests (no database needed).
Business logic (positions, rebalancing, concurrency, permissions, audit trail) was additionally
verified by a 93-check end-to-end run against a real PostgreSQL instance. Turning that into
repeatable integration tests (e.g. Vitest + Testcontainers or a dedicated test database) is the
natural next step.
