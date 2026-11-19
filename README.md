# McMasterful Books — BVD 103 Assignment 7

## What this is

The McMasterful Books backend, split into a separate service for each subdomain
(books, warehouse, orders), each with its own database, talking to each other only
through RabbitMQ events. Koa + tsoa APIs on MongoDB, with nginx in front of the
storefront, the APIs and a Swagger docs service, all on one origin.

## Architecture

```
                         browser
                            |
             +-------- nginx :8080 --------+
             | /              -> front-end |
             | /api/books     -> books     |
             | /api/warehouse -> warehouse |
             | /api/fulfil    -> warehouse |
             | /api/order     -> orders    |
             | /api/docs      -> docs      |
             +-----------------------------+
        books           warehouse           orders          docs
          |                 |                  |        (Swagger UI only)
        mongo          warehouse-db        orders-db
          |                 |                  |
          +----------- RabbitMQ (events) ------+
```

Each API has its **own database server**, and no service reads another's database or
calls another's API to do its job. When a service needs another service's data, it
keeps its **own copy**, kept up to date by **events** sent through RabbitMQ.

| Service | Owns | Database server | Keeps a copy of | Queue |
|---|---|---|---|---|
| books | the catalogue | `mongo` | each book's total stock | `books` |
| warehouse | shelf stock, fulfilment | `warehouse-db` | book names; open orders | `warehouse` |
| orders | placing and listing orders | `orders-db` | the valid book ids | `orders` |
| docs | the Swagger UI | none | none | none |

### Events

Every event goes through one RabbitMQ topic exchange, `mcmasterful-books`, keyed by its
name. Each service has its own durable queue, bound to only the events it listens to,
so events sent while a service is down wait in its queue until it is back. A message is
only removed after it has been handled. The events are defined once, in
`shared/events.ts`.

| Event | Sent by | When | Contains | Listened to by |
|---|---|---|---|---|
| `BookAdded` | books | a book is created | the book, with its id | warehouse (saves the name), orders (saves the id) |
| `BookUpdated` | books | a book is edited | the book | warehouse (updates the name) |
| `BookRemoved` | books | a book is deleted | the id | warehouse and orders (forget it) |
| `BookStocked` | warehouse | copies go on a shelf, or come off for an order | the book's new total stock | books (shows it as `stock`) |
| `OrderPlaced` | orders | an order is placed | order id, copies of each book | warehouse (keeps it for fulfilment) |
| `OrderFulfilled` | warehouse | an order is fulfilled | the order id | orders (removes it) |

What the copies are used for:

- **books** shows `stock` in the book list and book details.
- **warehouse** refuses to stock a book it doesn't know (`404 unknown book`), and
  fulfils orders from its own copy.
- **orders** refuses orders for books it doesn't know (`400 unknown book`).

### Design choices

- **Events carry new values, not changes.** `BookStocked` says "the total is now 7",
  not "add 3", and the copies are saved with upserts, so handling an event twice
  still gives the right result.
- **Events are sent only after the change is saved,** so a failed request never
  announces anything.
- **Initial sync.** The first time a service starts with an empty copy, it asks the
  other API for all of it once: warehouse and orders fetch the book list from books,
  and books fetches the stock totals from the warehouse (`GET /warehouse`). After that,
  only events keep the copies up to date. There is deliberately no sync for the
  warehouse's open orders: their events wait in its queue anyway, and a sync after a
  restart could bring back an order that was just fulfilled.
- **Eventually consistent.** The copies catch up within milliseconds, not instantly.
  For example, an order can still be listed for a moment after it is fulfilled.

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
docker compose up -d       # nginx, front-end, books, warehouse, orders, docs,
                           # mongo, warehouse-db, orders-db, rabbitmq
```

Forward port 8080 (VS Code **Ports** tab), then open:

- http://localhost:8080 — the storefront
- http://localhost:8080/api/docs — Swagger UI
- http://localhost:15672 — RabbitMQ dashboard (user `guest`, password `guest`; forward
  port 15672 too). The **Connections** tab shows one connection per API, and the
  **Queues** tab one queue per API.

Everything is served from port 8080. nginx sends `/` to the front-end,
`/api/warehouse` and `/api/fulfil/` to the warehouse API, `/api/order` to the orders
API, `/api/docs` to the docs service, and the rest of `/api/` to the books API.

The APIs wait for RabbitMQ to pass its health check before they start, so the first
`docker compose up` takes 10-20 seconds longer than the rest of the stack.

## See it working

With the stack running, in Swagger (http://localhost:8080/api/docs, **Try it out**) or
with `curl`:

1. `POST /api/books` with a book. Note the `id` it returns.
2. `PUT /api/warehouse/{id}/shelf_1/5`, then `POST /api/books/list` with `[]`: the
   book shows `"stock": 5`. books learned that from the warehouse's `BookStocked`.
3. `POST /api/order` with `{ "order": ["{id}", "{id}"] }`. Note the order id.
4. `PUT /api/fulfil/{order}` with
   `{ "booksFulfilled": [ { "book": "{id}", "shelf": "shelf_1", "numberOfBooks": 2 } ] }`.
   `GET /api/order` no longer lists it (`OrderFulfilled`), and the book list shows
   `"stock": 3`.
5. In the RabbitMQ dashboard (http://localhost:15672), **Queues** shows each
   service's messages being handled, and **Exchanges -> mcmasterful-books** shows the
   bindings.

To see that the services don't need each other to be running: `docker compose stop
warehouse`, place an order (step 3), `docker compose start warehouse`, wait about 30
seconds, and fulfil it (step 4). The `OrderPlaced` event waited in the warehouse's
queue.

## Testing

```bash
npm run test:ci
```

`npm run test:ci` generates the spec, routes and client once (`npm run generate`), then
runs each project's tests: 74 tests in 23 files (books 21, warehouse 37, orders 15,
docs 1). Each API test file starts its own in-memory MongoDB, so the tests don't need
`docker compose` running and never touch your real data. Generating the client takes
a few minutes. The root `lint` and `check-types` scripts also generate once first.

To run a single project's scripts directly (for example `cd books && npm test`), run
`./generate-openapi.sh` first whenever you change a controller. The projects no longer
regenerate on their own, so vitest's watch mode won't pick up controller changes.

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

Every book's total across all shelves:

```
GET /api/warehouse
```

```json
{ "65f1c0ffee1234567890abcd": 4 }
```

The book list (`POST /api/books/list`) and book details (`GET /api/books/{id}`) include
each book's `stock`, from books' own copy of these totals.

## Project layout

The repo is a monorepo: each API is its own Node project in a sub-folder, with its
own `package.json`. The root `package.json` only runs scripts across them.

```
books/        the book catalogue
warehouse/    shelf stock and order fulfilment
orders/       placing and listing orders
docs/         the Swagger UI for every API (no database, no routes of its own)
shared/       code every service shares (no package.json; checked by books' scripts):
                documented_types.ts  the API types (one copy, so tsoa can combine them)
                events.ts            the events, the EventBus interface, the fake bus
                rabbit_event_bus.ts  the RabbitMQ event bus
                initial_sync.ts      the one-time startup sync
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
- `GET /api/books/{id}` and `DELETE /api/books/{id}` work but are not in Swagger:
  the course template registers them on a separate (zod) router that tsoa can't see.
- The databases have no Docker volumes: their data lives inside the `mongo`,
  `warehouse-db` and `orders-db` containers. `docker compose stop` keeps it;
  `docker compose down` deletes it.
- Before V1.4.3, warehouse and orders shared the `mcmasterful-warehouse` database on
  the `mongo` server. That old database is left there unused; it can be dropped.
- The cache is stored inside the nginx container, so it is empty after a rebuild.
  Requests then start at `MISS` until it warms up again.
- The stock in the book list and book details is cached by nginx for up to 60
  seconds, so a stock change can take a minute to show there.
- Each API compiles its TypeScript when it starts (`npx tsx`), so after a restart it
  takes up to about 30 seconds to answer. Until then nginx returns `502`.
- Events are published after the database change succeeds, but not in the same
  transaction: if RabbitMQ were unreachable at that moment, the change would be saved
  and the event lost. The initial sync covers an empty copy, not a missed event.


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

### V1.2.3

The Swagger docs are now their own service, which completes Step 1: every subdomain
and the docs run as separate servers.

- New `docs/` Node project: a Koa app with only the Swagger UI, serving `/docs` and
  `/docs/spec` from the combined `build/swagger.json`. It has no database. Its new test
  checks that the spec contains every API's paths, so a service left out of the root
  `tsoa.json` is caught.
- books no longer serves the docs, and `koa2-swagger-ui` was removed from its packages.
- `docker-compose.yaml` adds a `docs` container; `nginx.conf` sends `/api/docs` to it.
  The rest of `/api/` now only reaches the books API.
- Code generation runs once: the copies of `vitest-openapi-plugin.ts` are gone, and the
  project scripts no longer call `generate-openapi.sh`. The root `generate` script runs
  it, and the root `lint`, `check-types` and `test:ci` run it once before the projects.
  Before, `test:ci` and `lint` each generated everything once per project.
- The root `package.json` installs, lints, type-checks and tests all four projects.

### V1.3.0

Step 2: RabbitMQ is added, and every API connects to it. No events are sent yet; that
is Step 3.

- `docker-compose.yaml` adds a `rabbitmq` container (`rabbitmq:3.13-management`) with
  a health check, and exposes its dashboard on port 15672. books, warehouse and orders
  wait until it is healthy before starting. docs doesn't use messaging, so it doesn't
  wait.
- books, warehouse and orders add `amqplib` 0.10.9 (and its types), pinned to the same
  version in all three.
- Each API has `src/messaging.ts`: `connectToBroker()` connects to `amqp://rabbitmq`
  (or `RABBITMQ_URL`), retrying every 2 seconds for about 30 seconds, opens a channel,
  and declares the `mcmasterful-books` topic exchange that all events will go through.
- Each API's `index.ts` connects before starting and passes the connection to
  `server()`, which keeps it for Step 3. The tests call `server()` without one, so they
  still run without RabbitMQ.

Checked with `docker compose up`: RabbitMQ becomes healthy, each API logs
`connected to RabbitMQ`, the dashboard shows three connections with one channel each and
the durable `mcmasterful-books` topic exchange, and the website, Swagger and the
book, shelf, order and fulfil flow all still work.

### V1.4.0

Step 3 begins. This version builds the event bus every service will use; no events are
sent yet, so the APIs behave exactly as before.

- `shared/events.ts` defines every event once (`BookAdded`, `BookUpdated`,
  `BookRemoved`, `BookStocked`, `OrderPlaced`, `OrderFulfilled`) and what each one
  contains, so the sender and the listeners always agree. Events carry new values (for
  example the new stock total), never changes like "add 3", so handling an event twice
  still gives the right result.
- `shared/events.ts` also has the `EventBus` interface and `InMemoryEventBus`, the fake
  bus for tests: no RabbitMQ, events are handled straight away, and it records
  everything published so a test can check what a service sent.
- `shared/rabbit_event_bus.ts` is the RabbitMQ version. Every event goes through the
  `mcmasterful-books` topic exchange, keyed by its name. Each service has its own
  durable queue, bound to only the events it subscribes to, so events sent while a
  service is down wait for it. A message is only removed after it is handled; a failed
  one is retried once, then logged and dropped so it can't block the queue.
- Each API's `src/messaging.ts` now returns an event bus on its own queue, `index.ts`
  passes it to `server()`, and `server()` starts receiving events once its
  subscriptions are set up. The tests get the in-memory bus by default.
- `books/tests/event_bus.spec.ts` tests both buses; the RabbitMQ one against a fake
  channel, so CI still needs no RabbitMQ.
- books' `lint` script now also lints `shared/`, which no project linted before. It
  found three small type issues in the new files, which are fixed.

### V1.4.1

Book events: warehouse and orders keep their own copy of which books exist, kept up to
date by events from books, and reject books that aren't in it.

- books publishes `BookAdded` (new book, with its id), `BookUpdated` and `BookRemoved`,
  only after the database change succeeds. A failed update or delete publishes nothing.
- warehouse keeps book names in a new `book_names` collection (`BookAdded` and
  `BookUpdated` save the name, `BookRemoved` deletes it). Stocking a book it doesn't
  know is now `404 unknown book: <id>`. A removed book's existing shelf stock stays
  recorded, since those copies still exist; it just can't be restocked.
- orders keeps valid book ids in a new `valid_books` collection (`BookAdded` saves,
  `BookRemoved` deletes; it doesn't need names, so it ignores `BookUpdated`). An order
  with any unknown book is now `400 unknown book: <ids>` and is not saved.
- The two collections have different names because warehouse and orders still share a
  database until V1.4.3.
- The new error responses are documented in Swagger, and the storefront shows their
  text.
- Initial sync (`shared/initial_sync.ts`): on startup, if its copy is empty, warehouse
  and orders each fetch the book list from the books API once, retrying while books
  starts. A failure is logged, not fatal. Without this, books created before this
  version couldn't be stocked or ordered.
- Tests: each project's test server gets its own fake event bus, so tests can send it
  events and check what it published. Existing tests that used made-up books now add
  them to the copy first. 17 new tests, 54 in total.
- `shared/tsconfig.json` lets books' `lint` and `check-types` scripts check every file
  in `shared/`. Before, only files books imported were checked.

Checked with `docker compose up`: RabbitMQ shows warehouse's queue bound to the three
book events and orders' to `BookAdded` and `BookRemoved`. A new book could be stocked,
ordered and fulfilled; made-up ids got 404 and 400; after deleting the book both
services rejected it. With both copies wiped, restarting warehouse and orders logged
`initial sync: copied 2 books`, and the same books could be stocked and ordered again.

### V1.4.2

Stock events: books keeps its own copy of each book's total stock and shows it.

- warehouse publishes `BookStocked` with the book's new total across all shelves,
  after copies are put on a shelf and, for each book in the order, after an order is
  fulfilled. A rejected shelving or a failed fulfilment publishes nothing.
- Because `BookStocked` now covers fulfilment too, `OrderFulfilled` only carries the
  order id (it is used in V1.4.3).
- books keeps the totals in a new `stock_levels` collection, separate from the book
  documents because updating a book replaces its whole document. Deleting a book also
  deletes its stock record.
- The book list and book details now return `stock` (0 for a book with no stock
  record), as the new `BookWithStock` type in Swagger. The type for creating a book is
  unchanged, so `stock` can't be sent when adding a book.
- New `GET /warehouse`: every book's total. books uses it for its initial stock sync:
  on startup, if its stock copy is empty, it fetches the totals once.
- `nginx.conf`: book details are cached for 60 seconds instead of 5 minutes, so the
  stock shown is at most a minute old. The warehouse route lost its trailing slash so
  `GET /api/warehouse` reaches the warehouse.
- 12 new tests, 66 in total.

Checked with `docker compose up`: books' queue is bound to `BookStocked`. A new book's
stock went from 0, to 5 after putting 3 and 2 copies on two shelves, to 3 after
fulfilling an order for 2. With books' stock copy wiped, restarting books logged
`initial sync: copied the stock of 7 books` and the stock was back. Swagger lists
`GET /warehouse` and the storefront still works.

### V1.4.3

Order events and separate databases: no service reads or writes another's data any
more.

- orders publishes `OrderPlaced` (order id and copies of each book) after saving an
  order; a rejected order publishes nothing. It subscribes to `OrderFulfilled` and
  removes that order.
- warehouse keeps its own copy of open orders from `OrderPlaced`, with the same id, so
  the fulfilment code is unchanged. After a successful fulfilment it publishes
  `OrderFulfilled` (as well as `BookStocked`). Its data layer lost `placeOrder` and
  `listOrders`, which belong to orders, and gained `saveOrder`.
- `docker-compose.yaml` adds the `warehouse-db` and `orders-db` Mongo servers. Each API
  gets its own server through `MONGO_URL` and waits only for that one: books on `mongo`
  (`mcmasterful-books`), warehouse on `warehouse-db` (`mcmasterful-warehouse`), orders on
  `orders-db` (`mcmasterful-orders`). The temporary shared-database code and comments
  are gone.
- There is no startup sync for the warehouse's open orders, on purpose: RabbitMQ keeps
  `OrderPlaced` events in the warehouse's queue while it is down, and a sync after a
  restart could bring back an order that was just fulfilled, letting it be fulfilled
  twice.
- 8 new tests, 74 in total.

Checked with `docker compose up`: warehouse's queue is bound to `OrderPlaced` and
orders' to `OrderFulfilled`. Shelving 5, ordering 2 and fulfilling left the order list
empty and books showing 3 in stock, with the order's copy in warehouse-db in between.
With the warehouse stopped, an order was placed; once the warehouse was back it could
fulfil that order, so the event had waited in its queue. Each Mongo server holds only
its own API's collections, and the only other services named in the APIs' code are the
two initial-sync requests.

### V1.4.4

Wrap-up. Step 3, and with it the assignment, is complete.

- README: new **Architecture** section (diagram, services and their copies, the event
  table, design choices) and **See it working** walkthrough; the overview, project
  layout and known limitations are updated.
- `books/package.json` is renamed from the template's `assignment-template` to
  `mcmasterful-books-api`, matching the other projects.
- The root `start-server` script is removed: it only started books, and everything
  runs through `docker compose`.

Checked with `docker compose up`, using the storefront adapter's requests through
nginx: add a book, filter and look it up (`stock` 0), put 4 and 2 copies on two shelves
(`stock` 6), order 3, list orders, fulfil from both shelves (order gone, shelves 2 and 1,
`stock` 3). Unknown books give `400` / `404 unknown book`, and a second fulfilment
fails. Swagger lists all eight tsoa routes under `/api` with the new responses and the
`stock` field. RabbitMQ showed every event handled and none waiting.
