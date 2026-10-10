# Task Board

Real-time Kanban board (Trello/Linear style).
**Server:** Node 22 · Express 5 · TypeScript · PostgreSQL · Prisma 7 · Socket.io · Zod · JWT
**Client:** React 19 · TypeScript · Vite · Tailwind v4 · TanStack Query · dnd-kit · socket.io-client

```
server/   prisma/schema.prisma + migrations, src/server.ts, src/modules/* (routes, controllers, services), src/middleware, src/realtime
client/   src/lib/api, src/features/board, src/components, vite.config.ts, package.json
docker-compose.yml   local PostgreSQL
AUDIT.md             cross-layer audit: contract, realtime, errors/middleware
```

Requirements: Node 22+, Docker (or any PostgreSQL 15+ and an adjusted `DATABASE_URL`).

## Setup and run

```bash
# 1. Database
docker compose up -d

# 2. Server (http://localhost:4000)
cd server
cp .env.example .env
# write a real JWT secret into .env:
sed -i "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=\"$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")\"|" .env
npm install                 # also runs `prisma generate`
npx prisma migrate deploy   # applies prisma/migrations (use `npx prisma migrate dev` when you change schema.prisma)
npm run dev

# 3. Client (http://localhost:5173) — in a second terminal
cd client
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173, register, create a workspace and a board. Open a second browser profile,
add that user to the workspace (Members), and watch both boards update live.

On Windows PowerShell, replace the `sed` line by editing `JWT_ACCESS_SECRET` in `server/.env` by hand
(any random string of 32+ characters).

## Environment

| File | Variable | Meaning |
| --- | --- | --- |
| server/.env | `DATABASE_URL` | PostgreSQL connection string |
| | `JWT_ACCESS_SECRET` | 32+ random characters (production refuses the placeholder) |
| | `CLIENT_ORIGIN` | exact browser origin for CORS + Socket.io (default `http://localhost:5173`) |
| | `PORT`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS` | optional |
| client/.env | `API_PROXY_TARGET` | where Vite forwards `/api` and `/socket.io` in dev |
| | `VITE_API_URL` | leave empty (same-origin) unless the API is on another origin |

## Checks

```bash
cd server && npm run typecheck && npm test      # 23 tests
cd client && npm run typecheck && npm run lint && npm test   # 16 tests
```

Production: `cd server && npm run build && npm run db:deploy && npm start`; `cd client && npm run build`
and serve `client/dist` with `/api` and `/socket.io` proxied to the server on the same origin.

## VS Code

Run `npm install` in **both** `server/` and `client/` first; without `node_modules` every import in
`App.tsx` shows as an error. Then open the repo root, run **TypeScript: Select TypeScript Version →
Use Workspace Version** (or accept the prompt) so the editor uses the project's TypeScript, and
**Developer: Reload Window** if stale errors remain.
