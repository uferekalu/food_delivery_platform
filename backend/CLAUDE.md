# Backend conventions

Full architecture/rationale: `../docs/ARCHITECTURE.md`. This file is the quick-reference for
working inside `backend/`.

## Stack specifics

- NestJS 11 + TypeScript, MongoDB via Mongoose (`@nestjs/mongoose`), env validated with Joi
  at boot (`src/common/config/env.validation.ts` — add new required vars there, and to
  `.env.example`, in the same change that introduces them).
- Structured logging via `nestjs-pino` (`app.useLogger`) — use Nest's injected `Logger`, never
  `console.log`. Pretty-printed in non-production, JSON in production.
- Global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) is already wired
  in `main.ts` — every endpoint validates input via a `class-validator` DTO, no raw `req.body`.
- Global `AllExceptionsFilter` (`src/common/filters/`) gives every error response the same
  shape (`statusCode`, `timestamp`, `path`, `message`); 5xx errors are logged with a stack
  trace, 4xx are not.
- `ThrottlerGuard` is applied globally (100 req/min default) via `APP_GUARD`.
- Swagger docs are served at `/api/docs` — every new controller/DTO should carry
  `@ApiTags`/`@ApiProperty` decorators so the docs stay useful, not just present.
- Health check: `GET /health` (Terminus), currently checks MongoDB connectivity. Extend it
  (don't replace it) as new critical dependencies are added.
- Auth (`src/auth/`) guards are **global and default-deny**: `JwtAuthGuard` + `RolesGuard` are
  registered via `APP_GUARD`, so every endpoint requires a valid access token unless explicitly
  marked `@Public()` (see `health.controller.ts` for the pattern — anything hit by an external
  health checker, webhook, etc. needs this). Add `@Roles('admin', ...)` on top of that for
  role-restricted endpoints. Password hashing is `bcryptjs` (pure JS — deliberately not the
  native `bcrypt` binding, to avoid native-module build issues in different deploy
  environments). Refresh tokens are opaque random strings (not JWTs), stored hashed in a
  per-token `RefreshToken` document (not a single field on `User`) so multiple devices/sessions
  work independently, with rotation-on-use and reuse-detection (a replayed, already-rotated
  token revokes the whole family) — see `auth.service.ts` for the full flow before changing it.
- Rate-limit sensitive auth endpoints individually with `@Throttle({ default: { limit: N, ttl:
  ms } })` on top of the global default — see `auth.controller.ts` (login/register/password
  endpoints are tighter than the app-wide 100/min).
- **Roles and how they're reached:** registration lets the person pick `customer` or
  `restaurant_owner` for themselves (`RegisterDto.role`, restricted to
  `SELF_REGISTERABLE_ROLES` in `users/schemas/user.schema.ts`) — this is normal (it's the
  "sign up as a merchant" choice every marketplace has), not a privilege escalation, because
  `restaurant_owner` only ever grants control over restaurants that user actually owns
  (enforced in `RestaurantsService.assertOwnerOrAdmin`). `admin` and `rider` are **never**
  self-selectable. `admin` is granted via `PATCH /users/:id/role` (admin-only) — which means
  the very first admin has to be bootstrapped outside the API: `npm run seed:admin --
  you@example.com` (after registering that account normally). Run this once per environment
  (including once against the production database after first deploy).
- **Ownership pattern**: any resource with an `ownerId` (restaurants, and menu items/categories
  transitively via their restaurant) checks ownership in the *service* layer, not a guard —
  see `RestaurantsService.assertOwnerOrAdmin` and how `MenuService` calls
  `RestaurantsService.findByIdOrThrow` + `assertOwnerOrAdmin` before every mutation. `@Roles()`
  only checks the role *label* (e.g. "is this a restaurant_owner at all"); it can't know which
  restaurant a given owner is allowed to touch, so ownership is always a second, explicit check.

## Module layout

One module per domain concept (`src/<domain>/<domain>.module.ts`), following the entity list
in `docs/ARCHITECTURE.md` §3. `src/common/` is for cross-cutting infra (config, filters,
guards, decorators) only — domain logic never lives there.

## Testing

- Unit tests (`*.spec.ts`) colocated with the code they test.
- e2e tests (`test/*.e2e-spec.ts`) boot the real `AppModule` against an in-memory MongoDB via
  `mongodb-memory-server` — never a real database, never mocked-away Mongoose. Set
  `process.env.MONGODB_URI` (and other required env vars) to the memory server's URI *before*
  compiling the testing module.
- **Always call `setupApp(app)` (`src/setup-app.ts`) right after `createNestApplication()` and
  before `app.init()`** in every e2e spec. `Test.createTestingModule(...).createNestApplication()`
  does **not** run `main.ts`'s `bootstrap()` — skip this and the test runs with no
  `ValidationPipe` (DTOs silently stop being validated — this exact gap let a weak password
  through in an early version of the auth e2e test), no exception filter, and no cookie
  parsing (`req.cookies` is `undefined`, breaking anything cookie-based like refresh/logout).
- `mongodb-memory-server`'s `MongoMemoryServer.create()` can take 15–30s+ on a cold/loaded
  machine — give `beforeAll` a generous timeout (`}, 30_000);`) rather than fighting Jest's 5s
  default, and do the same for individual tests that hash passwords with bcrypt (cost factor
  12 is deliberately slow) via `jest.setTimeout(30_000)` at the top of the file.
- `test/jest-e2e.json` sets `maxWorkers: 1` **deliberately** — every e2e spec file starts its
  own `mongodb-memory-server` instance, and Jest's default parallel-worker execution tries to
  start them all at once. On anything but a very fast machine that resource contention alone
  blows past the 30s `beforeAll` timeout for *every* suite simultaneously (hit directly during
  FDP-5, once 3 e2e spec files existed). Running e2e files serially costs wall-clock time but
  is correct; don't remove `maxWorkers` to "speed things up" without re-solving this.
- Every payment webhook handler (from FDP-8 onward) needs a test asserting it rejects an
  invalid signature — see `docs/ENGINEERING_RULES.md`.

## Local dev

```
npm run start:dev     # http://localhost:4000, /health, /api/docs
npm run lint
npm run test
npm run test:e2e
npm run build
```

`.env.example` documents required env vars — copy to `.env` for local dev, never commit real
values. Needs a local or Atlas MongoDB reachable at `MONGODB_URI`.
