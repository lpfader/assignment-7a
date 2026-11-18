# McMasterful Books — BVD 103 Assignment 7

## What this is

The McMasterful Books backend — Koa + tsoa APIs on MongoDB — plus the deployment
around it: nginx in front, the storefront and a separate API service for each
subdomain (books, warehouse, orders) behind it, all on one origin.

## Setup

You need Docker Desktop, and VS Code with the Dev Containers extension.

1. Open this folder in VS Code.
2. `Ctrl+Shift+P` → **Dev Containers: Reopen in Container**.
3. In the container terminal: `npm install` (from the repo root — this also installs
   each API project, see **Project layout** below)

The dev container has Node, Java (needed by the OpenAPI generator), and its own
Docker daemon, so `docker compose` works inside it.

## Running it

```bash
./generate-openapi.sh      # builds build/swagger.json and the client/ SDK
docker compose up -d       # nginx, front-end, books, warehouse, orders, mongo
```

Forward port 8080 (VS Code **Ports** tab), then open:

- http://localhost:8080 — the storefront
- http://localhost:8080/api/docs — Swagger UI

Everything is served from port 8080. nginx sends `/` to the front-end,
`/api/warehouse/` and `/api/fulfil/` to the warehouse API, `/api/order` to the orders
API, and the rest of `/api/` (books and the docs) to the books API.

## Testing

```bash
npm run test:ci
```

Each API runs its own tests: 31 tests in 13 files (books 6, warehouse 19, orders 6). Each test file starts its own in-memory MongoDB, so the tests don't need `docker compose` running and never touch your real data. The first run also regenerates the OpenAPI client, which takes a few minutes.

## Warehouse API examples

Put five copies of a book on a shelf:

```
PUT /api/warehouse/65f1c0ffee1234567890abcd/shelf_1/5
```

Response: `201 Created`, empty body.

Read back which shelves hold a book:

```
GET /api/warehouse/65f1c0ffee1234567890abcd
```

```json
{ "shelf_1": 5 }
```

Fulfil an order, taking one copy off `shelf_1`:

```
PUT /api/fulfil/65f1c0ffee1234567890abce
{ "booksFulfilled": [ { "book": "65f1c0ffee1234567890abcd", "shelf": "shelf_1", "numberOfBooks": 1 } ] }
```

Response: `201 Created`. A follow-up `GET /api/warehouse/...` now reports `4`.

## Project layout

The repo is a monorepo: each API is its own Node project in a sub-folder, with its
own `package.json`. The root `package.json` only runs scripts across them.

```
books/        the book catalogue, and the Swagger docs (for now)
warehouse/    shelf stock and order fulfilment
orders/       placing and listing orders
shared/       the API types every service shares (one copy, so tsoa can combine them)
adapter/      the storefront's adapter, mounted into the front-end container
client/       the generated OpenAPI client
tsoa.json     builds one combined build/swagger.json from every API's controllers
generate-openapi.sh, docker-compose.yaml, nginx.conf
```

`./generate-openapi.sh` builds the combined `build/swagger.json`, then each API's own
`build/routes.ts` (so each API registers only its own routes), then the client.

## Two compose files, on purpose

- `.devcontainer/docker-compose.yml` defines the **dev container** itself.
- `docker-compose.yaml` in the root defines the **deployed stack**.

They do different jobs. Only the root file is what the site runs from.

## Known limitations

- The catalogue starts **empty**. There is no seed data, so a fresh clone shows an
  empty storefront until books are added through the UI or `POST /api/books`.
- Book search is a `$regex` scan rather than an indexed search. Correct, but it
  gets slower as the catalogue grows.
- The cache is stored inside the nginx container, so it is empty after a rebuild.
  Requests then start at `MISS` until it warms up again.


## Version history

The goal of this assignment is to split the API into separate services (books,
warehouse, orders and a docs server) that talk to each other through RabbitMQ events
instead of shared data.

### V1.2.0

First step of the split: the existing API moved into its own `books/` folder, so the
other services can be created beside it. Nothing about how the API behaves changed.

- `git mv` moved the API (`index.ts`, `server.ts`, `src/`, `tests/`, the tsoa, vitest,
  TypeScript and ESLint configs, `package.json` and `package-lock.json`) into `books/`.
- The imports of the adapter types and of the generated client gained one more `../`.
- The new root `package.json` runs each script inside `books/`, and its `postinstall`
  runs `npm install` there, so `npm install` and the CI workflow work unchanged from
  the root.
- `generate-openapi.sh` now changes into `books/` itself, so it works from any folder.
  It still writes the client to the root `client/` folder.
- `docker-compose.yaml` starts the three API copies in `/app/books`. The whole repo is
  still mounted so the API can reach `adapter/`.

Checked in a `node:20` container: tsoa generates the routes, `tsc` and ESLint pass, and
all 29 tests pass.

### V1.2.1

The orders API is now its own service, and the Swagger docs come from one combined spec.

- New `orders/` Node project with its own `package.json`, server, tsoa config and tests.
  `place_order.ts` and `list_orders.ts` moved there with `git mv`; the `/order` routes
  moved out of `books/src/warehouse/warehouse.route.ts` into `orders/src/orders.route.ts`.
- `orders/src/orders_data.ts` holds the order half of the warehouse data layer. For
  now it uses the same `mcmasterful-warehouse` database as books, because the fulfil
  route in books still reads and removes orders. Step 3 replaces that with events.
- Combined swagger: the new root `tsoa.json` builds one `build/swagger.json` from every
  API's controllers, while each API generates only its own routes. Books serves the
  docs from that combined file, so `/order` still appears in Swagger.
- tsoa refuses two different definitions of the same type name in one spec, so
  `documented_types.ts` moved to `shared/` and both APIs import it.
- orders pins its packages (including tsoa 6.2.0 and TypeScript 5.4.3) to the versions
  books is locked to. A fresh install pulled tsoa 6.6.0, which rejects the existing
  `@returns {OrderId}` comments, so both APIs now build the same way.
- `docker-compose.yaml` runs one `books` and one `orders` container. The three
  round-robin copies (`yi`, `er`, `san`) are gone, since the assignment doesn't need them;
  adding a copy back is one more `server` line in that API's nginx upstream.
- `nginx.conf` has one upstream per API and sends `/api/order` to orders.
- The root `package.json` installs, lints, type-checks and tests both projects.
- books' fulfil test now adds its order straight into the database instead of calling
  `POST /order`, and orders has a new test for placing and listing an order.

Checked in a `node:20` container: spec and routes generate, `tsc` and ESLint pass for
both, and all 31 tests pass (25 books, 6 orders). Checked through nginx with
`docker compose up`: add a book, shelve it, place an order (answered by the orders
container), list it, fulfil it (stock drops, order disappears), Swagger lists all six
paths, and the storefront loads.

### V1.2.2

The warehouse API is now its own service, so each API handles only its own subdomain.

- New `warehouse/` Node project. `warehouse.route.ts` (the shelf and fulfil routes),
  `place_on_shelf.ts`, `get_book_info.ts`, `fulfil_order.ts`, `warehouse_data.ts` and
  `warehouse_database.ts` moved from `books/src/warehouse/` with `git mv`, unchanged
  apart from import paths.
- The warehouse still shares the `mcmasterful-warehouse` database with orders, because
  fulfilment reads and removes orders. Step 3 replaces that with events.
- books now only connects to `mcmasterful-books`. Its test helpers keep only the books
  seeding, and the warehouse got its own copy with the warehouse seeding.
- The three warehouse API tests moved from `books/tests/api.spec.ts` to
  `warehouse/tests/warehouse.spec.ts`. Still 31 tests: 6 books, 19 warehouse, 6 orders.
- warehouse is pinned to the same package versions as books and orders.
- Root `tsoa.json`, `generate-openapi.sh` and `package.json` now include warehouse.
- `docker-compose.yaml` adds a `warehouse` container; `nginx.conf` sends `/api/warehouse/`
  and `/api/fulfil/` to it.
- Lint fix: the lint scripts used `eslint ./**/*.ts`. In `sh`, `**` only goes one folder
  deep, so nested files like `src/books/*.ts` and root files like `server.ts` were never
  linted. They now use `eslint --ext .ts .`, which lints every TypeScript file. All
  three projects pass it as they are.
