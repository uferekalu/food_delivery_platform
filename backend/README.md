# Backend — Food Delivery Platform API

NestJS + TypeScript API for the food/grocery/pharmacy delivery platform. See the
[repo root README](../README.md) for the full-project overview, and
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for the technical source of truth. Backend-
specific conventions (ownership checks, module wiring patterns, testing gotchas) are in
[`CLAUDE.md`](./CLAUDE.md).

## Stack

NestJS, MongoDB via Mongoose, Passport JWT (access + rotating refresh tokens), Socket.IO
gateway for realtime order/chat/rider-location updates, Cloudinary for media uploads,
Stripe + Paystack + Flutterwave for payments, class-validator/class-transformer DTOs on every
endpoint, `@nestjs/throttler` rate limiting, Helmet, Swagger, Sentry, Resend (email), Termii
(SMS), web-push (VAPID), `migrate-mongo` for schema migrations, Jest for unit/e2e tests.
Deployed to **Railway** (see [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md)).

## Setup

```bash
npm install
cp .env.example .env    # see .env.example for what each variable is and where to get it —
                         # only MONGODB_URI is required to boot; everything else is optional
                         # and degrades gracefully when unset
```

## Running

```bash
npm run start        # plain start
npm run start:dev    # watch mode (recompiles + restarts on file change) — use this for dev
npm run start:debug   # watch mode + Node inspector attached
npm run start:prod    # runs the compiled dist/ output — what production actually runs
```

The API listens on `PORT` (default `4000`). Swagger docs are served once the app boots (see
`main.ts` for the exact path). A `GET /health` endpoint reports Mongo connectivity — this is
what Railway's healthcheck polls.

## First-time setup: bootstrapping an admin

Registering through the API only ever creates `customer` or `restaurant_owner` accounts —
`admin` is a privilege that must be granted manually, and `rider` goes through its own
application/verification flow instead of open signup. After registering a normal account:

```bash
npm run seed:admin -- you@example.com
```

Run this once per environment, including once against the production database after the first
deploy.

## Database migrations

Schema changes that need to run against existing data use `migrate-mongo`:

```bash
npm run migrate:create -- <name>   # scaffold a new migration
npm run migrate:up                  # apply pending migrations
npm run migrate:down                # roll back the last one
npm run migrate:status              # see what's applied / pending
```

Migrations do **not** run automatically on deploy — run `migrate:up` against the production
database as an explicit step after any deploy that includes one. See
[`../docs/ARCHITECTURE.md` §15](../docs/ARCHITECTURE.md) for the full migration/backup/disaster-
recovery picture.

## Backups

```bash
npm run backup    # dumps the database MONGODB_URI points at to a local file
npm run restore   # restores from a local dump
```

These produce/consume a local file only — copying that output to storage you actually control is
a separate, manual step. See `../docs/DEPLOYMENT.md` for how this fits into disaster recovery.

## Testing

```bash
npm run test        # unit tests
npm run test:watch   # unit tests, watch mode
npm run test:cov     # unit tests with coverage
npm run test:e2e     # end-to-end tests (spins up a real Mongo instance via mongodb-memory-server)
npm run lint          # eslint --fix
```

## Project structure

Each domain lives in its own `src/<domain>/` module — `module.ts` (wiring), `*.controller.ts`
(routes + guards), `*.service.ts` (business logic), `schemas/` (Mongoose schemas), `dto/`
(class-validator input shapes), `*.spec.ts` (Jest unit tests colocated with the code they test).
Cross-cutting concerns (auth guards, the realtime gateway, logging, exception filters) live under
`src/common/` and their own top-level modules. See
[`../docs/ARCHITECTURE.md` §3 (Domain model)](../docs/ARCHITECTURE.md) for what every core entity
represents and how they relate.
