# Cross-layer audit

## 1. Contract (database ↔ API ↔ client)
Method: every endpoint and all 12 socket events were called live, and each real JSON payload was assigned to the client's declared TypeScript type; `tsc` reported any missing, extra or mistyped field.

| Check | Result |
| --- | --- |
| Naming (`columnId`, `afterTaskId`, `afterColumnId`, `position`, `version`) | camelCase everywhere; Prisma model fields = API JSON = client types |
| IDs | UUID strings in all layers |
| `position` | Float on the server; the client sends *where* (`afterTaskId`), never a number |
| Missing / mistyped fields | none |
| Extra fields found | `Workspace.deletedAt`, `Board.createdById` → **fixed** (added to client types) |
| Migration | `prisma/migrations/20261010000000_init` generated from `schema.prisma`; applied to an empty PostgreSQL database (11 tables) |

## 2. Realtime and state
- Events are emitted after the transaction commits, to `board:<id>` rooms; handshake verifies the JWT, `board:join` re-checks membership.
- Client applies events to the same TanStack Query cache through pure functions (idempotent); own in-flight moves are skipped (`inflight.ts`); boards and open tasks are refetched after reconnect.
- Optimistic moves roll back and refetch on failure (verified in the browser).

## 3. Errors and middleware
- CORS: single configured origin, credentials on. helmet, rate limits (refresh successes are not counted), 256 KB JSON limit.
- Central error handler with one error shape and request ids; 404 for inaccessible resources.
- **Fixed in this pass:** `uncaughtException` handler with graceful exit; production refuses the placeholder JWT secret; React `ErrorBoundary` at the root; `errorMessage()` surfaces field-level validation errors; auth rate-limit split (login/refresh vs registration); add-task form no longer loses input typed while a request is pending; keyboard column-to-column drag and accurate screen-reader announcements.

## Verification run
Server: typecheck, 23 tests. Client: typecheck, lint, 16 tests. Earlier in the session: 93-check API end-to-end run against PostgreSQL. Browser (Chromium, two users): 21/22 checks on the final re-run.

## Known limits (not done)
- The one failing browser check is the keyboard drag step inside the long smoke script. The same keyboard moves pass in a standalone run (including moving the lower card of a column right), so I believe it is script state, but I did not finish isolating it. Please test keyboard drag manually.
- Not implemented: refresh-token reuse leeway for concurrent tabs on flaky networks, an `access:revoked` socket event (a removed member's board stays open until reload, though the server stops serving them), socket lifetime bound to token expiry, session cleanup job, hiding member emails from non-managers.
- The backend e2e and browser scripts are not included as repeatable tests.
