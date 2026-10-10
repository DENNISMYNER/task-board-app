# Task Board (web)

React frontend for the Task Board API: workspaces, Kanban boards with drag and drop, a task drawer
(details, comments, activity) and live updates over Socket.io.

**Stack:** React 19 · TypeScript · Vite · Tailwind CSS v4 · TanStack Query · React Router · dnd-kit · socket.io-client

## Quick start

The API must be running first (see the root README).

```bash
npm install
cp .env.example .env     # defaults work with the API on http://localhost:4000
npm run dev              # http://localhost:5173
```

Scripts: `npm run dev` · `npm run build` · `npm run preview` · `npm run typecheck` · `npm run lint` · `npm test`

In development the browser only talks to Vite. Vite forwards `/api` and `/socket.io` to the API
(`vite.config.ts`), so the app is same-origin: no CORS preflights, and the `HttpOnly` refresh cookie just works.
In production put the same two paths behind one reverse proxy, or set `VITE_API_URL` and configure
`CLIENT_ORIGIN` on the API.

## Structure

```
src/
  main.tsx, App.tsx          providers + routes (/login, /register, /w/:workspaceId, /w/:workspaceId/boards/:boardId)
  index.css                  design tokens (light + dark) and Tailwind theme
  lib/
    api/                     the ONLY code that calls fetch(); one typed file per resource
      http.ts                request(), ApiError, in-memory access token, single-flight refresh
      types.ts               DTOs that mirror the API's JSON
      auth.ts workspaces.ts boards.ts columns.ts tasks.ts comments.ts
    queryKeys.ts             every TanStack Query key in one place
    position.ts              fractional-position helper (mirrors the server's math)
    roles.ts                 hides actions the server would refuse anyway
  features/
    auth/                    AuthProvider, RequireAuth, login/register pages
    workspaces/              home redirect, workspace page (board list), members dialog
    board/
      boardCache.ts          PURE functions: BoardData in -> BoardData out (+ unit tests)
      keyboardCoordinates.ts keyboard rules for dragging between columns
      components/            BoardView (DndContext), Column, TaskCard, add-task / add-column forms
      hooks/                 useBoard (the one query), useMoves (optimistic moves), mutations
      realtime/              socket.ts, useBoardRealtime.ts, inflight.ts
    tasks/                   TaskDrawer, CommentsSection, ActivitySection
    shell/                   AppShell (top bar, workspace switcher)
  components/ui/             Button, Dialog, Menu, Toast, Avatar, StatusRing, PriorityIcon...
```

## How the important parts work

**One query per board.** `GET /boards/:id` returns the columns with their tasks in order, and that
single cache entry (`["board", id]`) is what the whole board renders from. Everything else
(optimistic updates, server responses, realtime events) is a change to that entry.

**Pure cache functions (`boardCache.ts`).** Moving a card, applying a server result, inserting a task
from a realtime event: each is a function `BoardData -> BoardData` with no React and no network. The same
functions serve all three sources of change, so a remote user's drag looks exactly like your own,
and applying the same event twice changes nothing. They are unit tested without a browser.

**Optimistic drag and drop (`useMoves.ts`).**
1. On drop, the cache is updated *synchronously*, so the card is already in place on the next paint.
2. The request goes out as `{ columnId, afterTaskId }`: where it was dropped, never a number.
3. The server's answer carries the real position (and any renumbering), which replaces the local guess.
4. If it fails, the card goes back, the board is refetched, and a toast explains.

**Dragging (`BoardView.tsx`).** While a drag is in progress the layout lives in component state (a
"draft"), not in the cache: cancelling leaves no trace and nothing hits the network per pixel. Mouse
needs 6px of movement (so a click still opens the task), touch needs a 220ms press (so swiping still scrolls).
Keyboard: `Space` picks up and drops, `←/→` moves between columns, `↑/↓` reorders, `Esc` cancels, `Enter`
opens a task. Screen readers hear the card's real column and position.

**Realtime (`useBoardRealtime.ts`).** One shared socket; each board page joins its room and applies
events to the same cache. Events about a card *you* are currently moving are skipped (`inflight.ts`) so
your own echo can't snap it back, and the board refetches afterwards if anything was skipped. After a
reconnect the board and open tasks are refetched to catch up on anything missed while offline.

**Auth (`http.ts`).** The access token lives in memory only. The refresh token is an `HttpOnly`
cookie that JavaScript never sees. A 401 triggers one refresh and a retry. The API rotates refresh
tokens and treats reuse as theft, so refreshes are single-flight (shared in a tab, serialised across
tabs with the Web Locks API).

## Testing

`npm test` runs unit tests for the cache functions (`boardCache.test.ts`). `npm run typecheck` and
`npm run lint` must pass before merging.

The whole stack was also exercised in a real browser (Chromium) against the API and PostgreSQL: sign-up
and onboarding, adding tasks, mouse and keyboard drag and drop (including persistence across a reload),
comments and activity, two users watching one board with live updates both ways, rollback after a failed
move, a phone-width layout, and dark mode. Those checks were a one-off script; turning them into
repeatable Playwright tests in CI is the natural next step.

## Known limits

- The board loads every task in every column. For boards with thousands of tasks, paginate per column.
- Comment threads refetch on realtime events instead of patching the cache.
- No offline queue: a move made while offline is rolled back with an error.
